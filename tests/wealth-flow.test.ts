import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, it, expect } from "vitest";
import { migrations } from "../lib/db/migrations";
import {
  readLedger,
  saveWealth,
  type WealthCommand,
} from "../lib/wealth/store";
import { valueAt } from "../lib/wealth/read";
import {
  accountTypes,
  bankIcon,
  defaultAccountNames,
  typeFor,
} from "../lib/wealth/catalog";
import { existsSync } from "node:fs";
let db: Database.Database;
const identity = {
  type: "create-account" as const,
  typeCode: "debit-card",
  name: "",
  note: "工资卡，日常收支",
  institution: "工商银行",
  cardLast4: "0012",
};
const asset = {
  name: "活钱",
  amount: "10000",
  currency: "CNY" as const,
  category: "cash" as const,
  date: "2026-11-17",
  include: true,
  note: "",
};
function save(c: WealthCommand, user = 81, id = randomUUID()) {
  return saveWealth(db, user, id, c);
}
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  for (const m of migrations) db.exec(m.sql);
  for (const id of [81, 82])
    db.prepare(
      "INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,0,0)",
    ).run(id, "测试", `flow-${id}`, "fixture");
});
afterEach(() => db.close());
it("账户单独保存、自动命名保留前导零；空账户不生成余额", () => {
  const id = randomUUID(),
    r = save(identity, 81, id);
  expect(save(identity, 81, id)).toEqual(r);
  const ledger = readLedger(db, 81);
  expect(ledger.accounts).toHaveLength(1);
  expect(ledger.accounts[0]).toMatchObject({
    name: "工商银行 · 尾号0012",
    note: identity.note,
    revision: 1,
  });
  expect(ledger.positions).toHaveLength(0);
  expect(ledger.valuations).toHaveLength(0);
  expect(() =>
    save({ ...identity, typeCode: "alipay", institution: "", cardLast4: "" }),
  ).toThrow("账户名称");
  save({ ...identity, typeCode: "credit-card" });
  expect(readLedger(db, 81).accounts[1].name).toBe("工商银行 · 尾号0012");
});
it("同一账户多笔资产批量原子保存，记账按类别默认并尊重手选", () => {
  const { accountId } = save(identity);
  const command = {
    type: "add-assets" as const,
    accountId,
    revision: 1,
    positions: [
      asset,
      { ...asset, name: "基金", category: "fund" as const, amount: "20000" },
      { ...asset, name: "定期", bookkeeping: false },
    ],
  };
  const id = randomUUID();
  const r = save(command, 81, id);
  expect(save(command, 81, id)).toEqual(r);
  const ledger = readLedger(db, 81);
  expect(ledger.positions.map((p) => p.bookkeeping_enabled)).toEqual([1, 0, 0]);
  expect(ledger.valuations).toHaveLength(3);
  expect(
    valueAt(ledger, "2026-11-17", {
      date: "",
      rates: { CNY: "1" },
      cached: false,
      unavailable: false,
    }).net,
  ).toBe("4000000");
  expect(() =>
    save({
      ...command,
      revision: 2,
      positions: [asset, { ...asset, amount: "-2" }],
    }),
  ).toThrow();
  expect(readLedger(db, 81).positions).toHaveLength(3);
});
it("逐笔删除保留账户与历史、排除汇总，重试不重复，多用户隔离", () => {
  const { accountId } = save(identity);
  const { positionId } = save({
    type: "add-assets",
    accountId,
    revision: 1,
    positions: [asset, { ...asset, name: "零余额", amount: "0" }],
  });
  const command = { type: "delete-asset" as const, positionId, revision: 0 },
    id = randomUUID();
  expect(() => save(command, 82)).toThrow();
  const r = save(command, 81, id);
  expect(save(command, 81, id)).toEqual(r);
  expect(readLedger(db, 81).positions).toHaveLength(1);
  expect(readLedger(db, 81).accounts).toHaveLength(1);
  expect(db.prepare("SELECT count(*) n FROM assets_valuations").get()).toEqual({
    n: 2,
  });
  expect(
    db
      .prepare("SELECT deleted_at FROM assets_positions WHERE id=?")
      .get(positionId),
  ).toHaveProperty("deleted_at");
  expect(() =>
    save({
      type: "record",
      positionId,
      revision: 1,
      amount: "1",
      date: asset.date,
      note: "",
    }),
  ).toThrow("找不到");
});
it("修改账户身份不改余额历史，禁止跨用户、类型转换及陈旧覆盖", () => {
  const { accountId } = save(identity);
  const c = {
    ...identity,
    type: "edit-account" as const,
    accountId,
    revision: 1,
    institution: "农业银行",
    cardLast4: "0001",
  };
  expect(() => save(c, 82)).toThrow();
  save(c);
  expect(readLedger(db, 81).accounts[0].name).toBe("农业银行 · 尾号0001");
  expect(() => save(c)).toThrow("另一页面");
  expect(() =>
    save({ ...c, revision: 2, typeCode: "alipay", name: "平台" }),
  ).toThrow("类型");
});
it("信用账户只能录正数负债且默认记账关闭", () => {
  const { accountId } = save({ ...identity, typeCode: "credit-card" });
  expect(() =>
    save({ type: "add-assets", accountId, revision: 1, positions: [asset] }),
  ).toThrow("不匹配");
  save({
    type: "add-assets",
    accountId,
    revision: 1,
    positions: [{ ...asset, category: "debt" }],
  });
  const l = readLedger(db, 81);
  expect(l.positions[0].bookkeeping_enabled).toBe(0);
  expect(
    valueAt(l, asset.date, {
      date: "",
      rates: { CNY: "1" },
      cached: false,
      unavailable: false,
    }).net,
  ).toBe("-1000000");
});
it("资产设置独立保存，不重复新增金额历史", () => {
  const { accountId } = save(identity);
  const { positionId } = save({
    type: "add-assets",
    accountId,
    revision: 1,
    positions: [asset],
  });
  save({
    type: "edit-asset",
    positionId,
    revision: 0,
    name: "应急现金",
    include: false,
    bookkeeping: false,
  });
  const l = readLedger(db, 81);
  expect(l.positions[0]).toMatchObject({
    name: "应急现金",
    include_in_totals: 0,
    bookkeeping_enabled: 0,
  });
  expect(l.valuations).toHaveLength(1);
});
it("57项目录和15家银行图标文件完整，平台代码不变", () => {
  expect(accountTypes).toHaveLength(57);
  for (const t of accountTypes)
    expect(existsSync("public" + t.icon), t.name).toBe(true);
  for (const name of [
    "工商银行",
    "农业银行",
    "中国银行",
    "建设银行",
    "交通银行",
    "邮储银行",
    "招商银行",
    "中信银行",
    "浦发银行",
    "兴业银行",
    "民生银行",
    "光大银行",
    "平安银行",
    "华夏银行",
    "广发银行",
    "其他银行",
  ])
    expect(existsSync("public" + bankIcon(name)), name).toBe(true);
  for (const code of ["antfortune", "jd", "tencentwealth"])
    expect(typeFor(code)?.group).toBe(3);
  expect(Object.keys(defaultAccountNames)).toHaveLength(4);
});
it("迁移保留旧名称为备注、记账手选与余额历史，其他模块不变", () => {
  const old = new Database(":memory:");
  try {
    old.pragma("foreign_keys=ON");
    for (const m of migrations.filter((m) => m.version < 16)) old.exec(m.sql);
    old.exec(
      "INSERT INTO users(id,name,phone,password_hash,created_at,updated_at) VALUES(91,'旧用户','legacy','fixture',1,1); INSERT INTO assets_accounts(id,user_id,type_code,institution,name,note,card_last4,bookkeeping_enabled,created_at,updated_at) VALUES(1,91,'debit-card','工商银行','工资卡','日常收支','0012',1,1,1); INSERT INTO assets_positions(id,user_id,account_id,name,category_code,side,currency_code,include_in_totals,created_at,updated_at) VALUES(1,91,1,'基金','fund','asset','CNY',1,1,1); INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,recorded_at) VALUES(91,1,'2026-11-17',12345,1)",
    );
    const before = old.prepare("SELECT * FROM assets_valuations").all();
    old.exec(migrations.find((m) => m.version === 16)!.sql);
    expect(old.prepare("SELECT * FROM assets_valuations").all()).toEqual(
      before,
    );
    const l = readLedger(old, 91);
    expect(l.accounts[0]).toMatchObject({
      name: "工商银行 · 尾号0012",
      note: "工资卡，日常收支",
    });
    expect(l.positions[0].bookkeeping_enabled).toBe(1);
    expect(old.pragma("foreign_key_check")).toEqual([]);
  } finally {
    old.close();
  }
});
