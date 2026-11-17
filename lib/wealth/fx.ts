import type Database from "better-sqlite3";
import { currencies, today } from "./catalog";

export type RateSet = {
  date: string;
  rates: Record<string, string>;
  cached: boolean;
  unavailable: boolean;
};
type Cache = {
  payload: string | null;
  fetched_at: number;
  attempted_at: number;
  failed: number;
};
const inFlight = new WeakMap<
  Database.Database,
  Map<string, Promise<RateSet>>
>();
export async function exchangeRates(
  db: Database.Database,
  date = "latest",
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<RateSet> {
  let pending = inFlight.get(db);
  if (!pending) {
    pending = new Map();
    inFlight.set(db, pending);
  }
  const existing = pending.get(date);
  if (existing) return existing;
  const request = load(db, date, fetcher, now);
  pending.set(date, request);
  try {
    return await request;
  } finally {
    pending.delete(date);
  }
}
async function load(
  db: Database.Database,
  date: string,
  fetcher: typeof fetch,
  now: number,
): Promise<RateSet> {
  const cached = db
    .prepare("SELECT * FROM assets_fx_cache WHERE cache_key=?")
    .get(date) as Cache | undefined;
  const previous = cached?.payload
    ? (JSON.parse(cached.payload) as {
        date: string;
        rates: Record<string, string>;
      })
    : null;
  const valid =
    cached &&
    previous &&
    !cached.failed &&
    (date !== "latest" || now - cached.fetched_at < 3600000);
  if (valid) return { ...previous, cached: true, unavailable: false };
  if (cached?.failed && now - cached.attempted_at < 300000)
    return {
      date: previous?.date ?? "",
      rates: previous?.rates ?? {},
      cached: !!previous,
      unavailable: true,
    };
  try {
    const params = new URLSearchParams({
      base: "EUR",
      quotes: Object.keys(currencies)
        .filter((c) => c !== "EUR")
        .join(","),
    });
    if (date !== "latest") params.set("date", date);
    const response = await fetcher(
      "https://api.frankfurter.dev/v2/providers/ecb/rates?" + params,
      { signal: AbortSignal.timeout(5000), cache: "no-store" },
    );
    if (!response.ok) throw Error("FX HTTP error");
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || !rows.length) throw Error("FX empty");
    const rates: Record<string, string> = { EUR: "1" };
    let rateDate = "";
    for (const row of rows) {
      if (
        !row ||
        row.base !== "EUR" ||
        !(row.quote in currencies) ||
        typeof row.rate !== "number" ||
        row.rate <= 0 ||
        !/^\d+(\.\d{1,12})?$/.test(String(row.rate)) ||
        typeof row.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        row.date > (date === "latest" ? today() : date)
      )
        throw Error("FX invalid");
      if (rateDate && rateDate !== row.date) throw Error("FX mixed dates");
      rateDate = row.date;
      rates[row.quote] = String(row.rate);
    }
    if (Object.keys(currencies).some((c) => !rates[c]))
      throw Error("FX incomplete");
    const result = { date: rateDate, rates };
    db.prepare(
      "INSERT INTO assets_fx_cache VALUES(?,?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,failed=0",
    ).run(date, JSON.stringify(result), now, now);
    return { ...result, cached: false, unavailable: false };
  } catch {
    db.prepare(
      "INSERT INTO assets_fx_cache VALUES(?,NULL,0,?,1) ON CONFLICT(cache_key) DO UPDATE SET attempted_at=excluded.attempted_at,failed=1",
    ).run(date, now);
    return {
      date: previous?.date ?? "",
      rates: previous?.rates ?? {},
      cached: !!previous,
      unavailable: true,
    };
  }
}
