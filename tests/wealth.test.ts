import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "../lib/db/migrations";
import { accountTypes, currencies } from "../lib/wealth/catalog";
import { decimal, parseMoney, toCny } from "../lib/wealth/money";
import {
  readLedger,
  saveWealth,
  type WealthCommand,
} from "../lib/wealth/store";
import { readWealth, valueAt, trendDates } from "../lib/wealth/read";
import { exchangeRates } from "../lib/wealth/fx";
import { loginDestination } from "../lib/login-routing";
const rates = {
  date: "2026-11-16",
  rates: { CNY: "7.8", USD: "1.2", JPY: "160", EUR: "1" },
  cached: false,
  unavailable: false,
};
const create = (
  overrides: Partial<Extract<WealthCommand, { type: "create" }>> = {},
): Extract<WealthCommand, { type: "create" }> => ({
  type: "create",
  name: "测试账户",
  typeCode: "alipay",
  note: "",
  institution: "",
  cardLast4: "",
  bookkeeping: true,
  position: {
    name: "人民币余额",
    category: "cash",
    currency: "CNY",
    amount: "100.01",
    date: "2026-10-01",
    include: true,
    note: "",
  },
  ...overrides,
});
describe("资产独立存储及人民币汇总", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys=ON");
    for (const m of migrations) db.exec(m.sql);
    for (const id of [81, 82])
      db.prepare(
        "INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      ).run(id, "测试用户" + id, "wealth-" + id, "fixture", 0, 0);
  });
  afterEach(() => db.close());
  function save(c: WealthCommand, user = 81, id = randomUUID()) {
    return saveWealth(db, user, id, c);
  }
  it("只白名单接收wealth登录地址", () => {
    expect(loginDestination("/wealth")).toBe("/wealth");
    expect(loginDestination("/wealth/dashboard?view=wealth")).toBe(
      "/wealth/dashboard?view=wealth",
    );
    expect(loginDestination("//bad.test/wealth")).toBe("/");
  });
  it("保留六类51个唯一账户类型及独立品牌图标", () => {
    expect(accountTypes).toHaveLength(51);
    expect(new Set(accountTypes.map((t) => t.code)).size).toBe(51);
    expect(
      [0, 1, 2, 3, 4, 5].map(
        (g) => accountTypes.filter((t) => t.group === g).length,
      ),
    ).toEqual([23, 9, 7, 8, 2, 2]);
    expect(accountTypes.find((t) => t.code === "lingqiantong")!.icon).toContain(
      "lingqiantong.svg",
    );
  });
  it("十进制精确到最小单位，日元禁止小数，超限及负值拒绝", () => {
    expect(parseMoney("0.29", "CNY")).toBe(29);
    expect(decimal(123456, "CNY")).toBe("1234.56");
    expect(parseMoney("160000", "JPY")).toBe(160000);
    for (const v of ["-1", "1e5", "1.001", "1000000000000", "NaN"])
      expect(() => parseMoney(v, "CNY")).toThrow();
    expect(() => parseMoney("1.1", "JPY")).toThrow();
    expect(toCny(120, "USD", "7.8", "1.2")).toBe("780");
    expect(toCny(16000, "JPY", "7.8", "160")).toBe("78000");
  });
  it("新账户原子建明细和历史，不给其他用户或模块写余额", () => {
    save(create());
    expect(readLedger(db, 81).accounts).toHaveLength(1);
    expect(readLedger(db, 81).valuations[0].amount_minor).toBe(10001);
    expect(readLedger(db, 82).positions).toHaveLength(0);
    expect(db.prepare("SELECT count(*) AS n FROM gym_workouts").get()).toEqual({
      n: 0,
    });
    expect(() =>
      save(create({ position: { ...create().position, amount: "-10" } })),
    ).toThrow();
    expect(readLedger(db, 81).accounts).toHaveLength(1);
  });
  it("银行卡保留前导零，必须有机构和尾号", () => {
    expect(() => save(create({ typeCode: "debit-card" }))).toThrow();
    save(
      create({
        typeCode: "debit-card",
        institution: "工商银行",
        cardLast4: "0012",
      }),
    );
    expect(readLedger(db, 81).accounts[0].card_last4).toBe("0012");
  });
  it("请求去重且同编号不同内容拒绝，不依赖客户端禁用按钮", () => {
    const id = randomUUID(),
      command = create();
    const first = save(command, 81, id);
    expect(save(command, 81, id)).toEqual(first);
    expect(() => save({ ...command, name: "不同内容" }, 81, id)).toThrow();
    expect(readLedger(db, 81).valuations).toHaveLength(1);
    save(command, 82, id);
    expect(readLedger(db, 82).accounts).toHaveLength(1);
  });
  it("同账户多币种明细相加一次，排除项和债务分别处理", () => {
    const { accountId } = save(create());
    save({
      type: "add",
      accountId,
      revision: 1,
      position: {
        ...create().position,
        name: "美元",
        currency: "USD",
        amount: "100",
      },
    });
    save(
      create({
        typeCode: "credit-card",
        institution: "招商银行",
        cardLast4: "8899",
        position: { ...create().position, category: "debt", amount: "50" },
      }),
    );
    save(
      create({
        position: { ...create().position, amount: "900", include: false },
      }),
    );
    const v = valueAt(readLedger(db, 81), "2026-11-17", rates);
    expect(v.assets).toBe("75001");
    expect(v.liabilities).toBe("5000");
    expect(v.net).toBe("70001");
  });
  it("跨用户追加、更新及伪造关联均拒绝", () => {
    const { accountId, positionId } = save(create());
    expect(() =>
      save(
        { type: "add", accountId, revision: 1, position: create().position },
        82,
      ),
    ).toThrow();
    expect(() =>
      save(
        {
          type: "record",
          positionId,
          revision: 0,
          amount: "20",
          date: "2026-11-01",
          note: "",
        },
        82,
      ),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,recorded_at) VALUES(82,?,'2026-11-01',10,0)",
        )
        .run(positionId),
    ).toThrow();
    expect(readLedger(db, 81).valuations).toHaveLength(1);
  });
  it("保留历史，补录旧日不覆盖当前，同日后录优先，旧版本阻止覆盖", () => {
    const { positionId } = save(create());
    save({
      type: "record",
      positionId,
      revision: 0,
      amount: "200",
      date: "2026-11-01",
      note: "首次",
    });
    expect(() =>
      save({
        type: "record",
        positionId,
        revision: 0,
        amount: "999",
        date: "2026-11-01",
        note: "",
      }),
    ).toThrow();
    save({
      type: "record",
      positionId,
      revision: 1,
      amount: "80",
      date: "2026-09-01",
      note: "补录",
    });
    save({
      type: "record",
      positionId,
      revision: 2,
      amount: "210",
      date: "2026-11-01",
      note: "更正",
    });
    const l = readLedger(db, 81);
    expect(l.valuations).toHaveLength(4);
    expect(valueAt(l, "2026-11-17", rates).assets).toBe("21000");
    expect(valueAt(l, "2026-09-30", rates).assets).toBe("8000");
  });
  it("日期必须真实且不晚于今天，负债类别不能伪装成资产", () => {
    for (const date of ["2026-02-30", "9999-01-01", "bad"])
      expect(() =>
        save(create({ position: { ...create().position, date } })),
      ).toThrow();
    expect(() =>
      save(create({ position: { ...create().position, category: "debt" } })),
    ).toThrow();
  });
  it("趋势不伪造创建前余额，缺汇率不会把外币当0", async () => {
    save(create({ position: { ...create().position, currency: "USD" } }));
    const fail = vi.fn(async () => {
      throw Error("offline");
    }) as unknown as typeof fetch;
    const data = await readWealth(db, 81, fail, "2026-11-17");
    expect(data.positions[0].cny).toBeNull();
    expect(data.missing).toBe(1);
    expect(data.trend.every((p) => p.net === null)).toBe(true);
    expect(data.valuations).toHaveLength(1);
    expect(trendDates("2026-11-17")).toEqual([
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-17",
    ]);
  });
  it("汇率缓存、并发复用、失败保留旧值，历史不使用最新汇率替代", async () => {
    const payload = Object.keys(currencies)
      .filter((c) => c !== "EUR")
      .map((quote) => ({
        base: "EUR",
        quote,
        rate: quote === "CNY" ? 7.8 : 1.2,
        date: "2026-11-16",
      }));
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
    ) as unknown as typeof fetch;
    const [a, b] = await Promise.all([
      exchangeRates(db, "latest", fetcher, 10000000),
      exchangeRates(db, "latest", fetcher, 10000000),
    ]);
    expect(a.rates.CNY).toBe("7.8");
    expect(b).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await exchangeRates(db, "latest", fetcher, 10000001);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const fail = vi.fn(async () => {
      throw Error("offline");
    }) as unknown as typeof fetch;
    const stale = await exchangeRates(db, "latest", fail, 20000000);
    expect(stale.unavailable).toBe(true);
    expect(stale.rates.CNY).toBe("7.8");
    await exchangeRates(db, "latest", fail, 20000001);
    expect(fail).toHaveBeenCalledTimes(1);
    const historical = await exchangeRates(db, "2026-09-30", fail, 20000000);
    expect(historical.rates.CNY).toBeUndefined();
  });
});
