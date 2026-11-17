import type Database from "better-sqlite3";
import { completedByScheduledDay } from "../todo/dashboard";
import { shanghaiNow, type TodoState } from "../todo/model";
import { readLedger } from "../wealth/store";
import { latestValues, valueAt } from "../wealth/read";
import { exchangeRates, type RateSet } from "../wealth/fx";
import { calendarDays, homeModules, monthHeatmap, type HomeData, type HomeModule } from "./model";

export function enableModule(db: Database.Database, userId: number, module: unknown, now = Date.now()) {
  if (typeof module !== "string" || !homeModules.includes(module as HomeModule)) throw Error("这个板块暂未开放");
  db.prepare("INSERT OR IGNORE INTO home_user_modules(user_id,module,enabled_at) VALUES(?,?,?)").run(userId, module, now);
}
export function enabledModules(db: Database.Database, userId: number): HomeModule[] {
  // Direct use of existing module URLs also counts as activation. Empty reads do
  // not create workspace rows, so a brand-new account still starts with none.
  db.prepare(`INSERT OR IGNORE INTO home_user_modules(user_id,module,enabled_at)
    SELECT user_id,'gym',0 FROM gym_plans WHERE user_id=@user
    UNION SELECT user_id,'gym',0 FROM gym_dashboard_settings WHERE user_id=@user
    UNION SELECT user_id,'todo',0 FROM todo_workspaces WHERE user_id=@user
    UNION SELECT user_id,'todo',0 FROM todo_dashboard_layouts WHERE user_id=@user
    UNION SELECT user_id,'wealth',0 FROM assets_accounts WHERE user_id=@user`).run({ user: userId });
  const rows = db.prepare("SELECT module FROM home_user_modules WHERE user_id=?").all(userId) as { module: HomeModule }[];
  return homeModules.filter((module) => rows.some((row) => row.module === module));
}
export async function homeTrend(db: Database.Database, userId: number, date: string, fetcher: typeof fetch = fetch) {
  const ledger = readLedger(db, userId);
  const assets = new Set(ledger.positions.filter((p) => p.include_in_totals && p.side === "asset").map((p) => p.id));
  const recorded = ledger.valuations.filter((v) => assets.has(v.position_id) && v.as_of_date <= date);
  if (!recorded.length) return [];
  const yearStart = date.slice(0, 4) + "-01-01";
  const first = recorded.reduce((min, v) => v.as_of_date < min ? v.as_of_date : min, date);
  const dates = new Set([first < yearStart ? yearStart : first, date]);
  for (let month = 1; month < Number(date.slice(5, 7)); month++) {
    const d = new Date(Date.UTC(Number(date.slice(0, 4)), month, 0)).toISOString().slice(0, 10);
    if (d >= first) dates.add(d);
  }
  const noFx: RateSet = { date: "", rates: { CNY: "1" }, cached: false, unavailable: false };
  return Promise.all([...dates].sort().map(async (day) => {
    const values = latestValues(ledger, day);
    const relevant = ledger.positions.filter((p) => assets.has(p.id) && values.has(p.id));
    const foreign = relevant.some((p) => p.currency_code !== "CNY");
    const fx = foreign ? await exchangeRates(db, day === date ? "latest" : day, fetcher) : noFx;
    // Total assets, not net worth. An unavailable currency leaves a real gap.
    const total = valueAt({ ...ledger, positions: ledger.positions.filter((p) => p.side === "asset") }, day, fx);
    return { date: day, value: !relevant.length || total.missing ? null : Number(total.assets) / 100 };
  }));
}
export async function readHome(db: Database.Database, userId: number, date = shanghaiNow().date, fetcher: typeof fetch = fetch): Promise<HomeData> {
  const modules = enabledModules(db, userId);
  const start = date.slice(0, 4) + "-01-01", end = String(Number(date.slice(0, 4)) + 1) + "-01-01";
  const life = new Map<string, number>(), gym = new Map<string, number>();
  const add = (day: string, count: number) => life.set(day, (life.get(day) ?? 0) + count);
  let completed = 0;
  if (modules.includes("todo")) {
    const row = db.prepare("SELECT payload FROM todo_workspaces WHERE user_id=?").get(userId) as { payload: string } | undefined;
    const counts = completedByScheduledDay(row ? (JSON.parse(row.payload) as TodoState).events : []);
    for (const [day, count] of counts) {
      if (day >= start && day <= date) { add(day, count); completed += count; }
    }
  }
  if (modules.includes("gym")) {
    const rows = db.prepare("SELECT day,count(*) AS count FROM gym_workouts WHERE user_id=? AND finished IS NOT NULL AND day>=? AND day<=? GROUP BY day").all(userId, start, date) as { day: string; count: number }[];
    for (const row of rows) { add(row.day, row.count); gym.set(row.day, row.count); }
  }
  if (modules.includes("wealth")) {
    const rows = db.prepare("SELECT as_of_date AS day,count(*) AS count FROM assets_valuations WHERE user_id=? AND as_of_date>=? AND as_of_date<=? GROUP BY as_of_date").all(userId, start, date) as { day: string; count: number }[];
    for (const row of rows) add(row.day, row.count);
  }
  return { date, modules, completed, life: calendarDays(start, end, date, life), gym: monthHeatmap(date, gym), trend: modules.includes("wealth") ? await homeTrend(db, userId, date, fetcher) : [] };
}
