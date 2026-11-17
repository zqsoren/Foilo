import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  categories,
  currencies,
  today,
  typeFor,
  type Category,
  type Currency,
} from "./catalog";
import { parseMoney } from "./money";

export type Account = {
  id: number;
  type_code: string;
  institution: string;
  name: string;
  note: string;
  card_last4: string;
  bookkeeping_enabled: number;
  revision: number;
  created_at: number;
  updated_at: number;
};
export type Position = {
  id: number;
  account_id: number;
  name: string;
  category_code: Category;
  side: "asset" | "liability";
  currency_code: Currency;
  include_in_totals: number;
  revision: number;
  created_at: number;
  updated_at: number;
};
export type Valuation = {
  id: number;
  position_id: number;
  as_of_date: string;
  amount_minor: number;
  note: string;
  recorded_at: number;
};
export type Ledger = {
  accounts: Account[];
  positions: Position[];
  valuations: Valuation[];
};
const text = z.string().trim().min(1, "请填写名称").max(80, "名称最多80个字");
const note = z.string().trim().max(500, "备注最多500个字");
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      v >= "1999-01-04" &&
      v <= today() &&
      Number.isFinite(new Date(v + "T00:00:00Z").getTime()) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "请选择有效记录日期（1999年1月4日至今天）",
  );
const positionFields = {
  name: text,
  category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
  currency: z.enum(Object.keys(currencies) as [Currency, ...Currency[]]),
  include: z.boolean(),
  amount: z.string().max(30),
  date,
  note,
};
const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    typeCode: z.string().max(40),
    name: text,
    note,
    institution: z.string().trim().max(80),
    cardLast4: z.string().regex(/^(\d{4})?$/, "请输入4位卡号尾号"),
    bookkeeping: z.boolean(),
    position: z.object(positionFields),
  }),
  z.object({
    type: z.literal("add"),
    accountId: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    position: z.object(positionFields),
  }),
  z.object({
    type: z.literal("record"),
    positionId: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    amount: z.string().max(30),
    date,
    note,
  }),
]);
export type WealthCommand = z.infer<typeof commandSchema>;
export function readLedger(db: Database.Database, userId: number): Ledger {
  return {
    accounts: db
      .prepare(
        "SELECT id,type_code,institution,name,note,card_last4,bookkeeping_enabled,revision,created_at,updated_at FROM assets_accounts WHERE user_id=? ORDER BY id",
      )
      .all(userId) as Account[],
    positions: db
      .prepare(
        "SELECT id,account_id,name,category_code,side,currency_code,include_in_totals,revision,created_at,updated_at FROM assets_positions WHERE user_id=? ORDER BY id",
      )
      .all(userId) as Position[],
    valuations: db
      .prepare(
        "SELECT id,position_id,as_of_date,amount_minor,note,recorded_at FROM assets_valuations WHERE user_id=? ORDER BY as_of_date DESC,id DESC",
      )
      .all(userId) as Valuation[],
  };
}
export function saveWealth(
  db: Database.Database,
  userId: number,
  requestId: string,
  input: unknown,
  now = Date.now(),
): { accountId: number; positionId: number } {
  if (!z.uuid().safeParse(requestId).success)
    throw Error("请求编号无效，请重新打开表单");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw Error(parsed.error.issues[0]?.message ?? "请检查填写内容");
  const command = parsed.data,
    hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  return db
    .transaction(() => {
      const prior = db
        .prepare(
          "SELECT command_hash,result_json FROM assets_requests WHERE user_id=? AND request_id=?",
        )
        .get(userId, requestId) as
        | { command_hash: string; result_json: string }
        | undefined;
      if (prior) {
        if (prior.command_hash !== hash)
          throw Error("请求内容已改变，请重新提交");
        return JSON.parse(prior.result_json) as {
          accountId: number;
          positionId: number;
        };
      }
      let accountId: number, positionId: number;
      if (command.type === "record") {
        const p = db
          .prepare("SELECT * FROM assets_positions WHERE id=? AND user_id=?")
          .get(command.positionId, userId) as Position | undefined;
        if (!p) throw Error("找不到这笔明细");
        if (p.revision !== command.revision)
          throw Error("此明细已在另一页面更新，请刷新后核对再保存");
        const amount = parseMoney(command.amount, p.currency_code);
        db.prepare(
          "INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,note,recorded_at) VALUES(?,?,?,?,?,?)",
        ).run(userId, p.id, command.date, amount, command.note, now);
        db.prepare(
          "UPDATE assets_positions SET revision=revision+1,updated_at=? WHERE id=? AND user_id=?",
        ).run(now, p.id, userId);
        accountId = p.account_id;
        positionId = p.id;
      } else {
        let account: Account;
        if (command.type === "create") {
          const type = typeFor(command.typeCode);
          if (!type) throw Error("请选择有效账户类型");
          if (type.bank && (!command.institution || !command.cardLast4))
            throw Error("请填写所属银行和4位卡号尾号");
          accountId = Number(
            db
              .prepare(
                "INSERT INTO assets_accounts(user_id,type_code,institution,name,note,card_last4,bookkeeping_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
              )
              .run(
                userId,
                type.code,
                type.bank ? command.institution : "",
                command.name,
                command.note,
                type.bank ? command.cardLast4 : "",
                Number(command.bookkeeping),
                now,
                now,
              ).lastInsertRowid,
          );
          account = { type_code: type.code } as Account;
        } else {
          accountId = command.accountId;
          const a = db
            .prepare("SELECT * FROM assets_accounts WHERE id=? AND user_id=?")
            .get(accountId, userId) as Account | undefined;
          if (!a) throw Error("找不到这个账户");
          if (a.revision !== command.revision)
            throw Error("此账户已在另一页面更新，请刷新后核对再保存");
          account = a;
        }
        const type = typeFor(account.type_code)!;
        const p = command.position;
        if ((type.side === "liability") !== (p.category === "debt"))
          throw Error("资产与负债类别不匹配");
        const amount = parseMoney(p.amount, p.currency);
        positionId = Number(
          db
            .prepare(
              "INSERT INTO assets_positions(user_id,account_id,name,category_code,side,currency_code,include_in_totals,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            )
            .run(
              userId,
              accountId,
              p.name,
              p.category,
              type.side,
              p.currency,
              Number(p.include),
              now,
              now,
            ).lastInsertRowid,
        );
        db.prepare(
          "INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,note,recorded_at) VALUES(?,?,?,?,?,?)",
        ).run(userId, positionId, p.date, amount, p.note, now);
      }
      db.prepare(
        "UPDATE assets_accounts SET revision=revision+1,updated_at=? WHERE id=? AND user_id=?",
      ).run(now, accountId, userId);
      const result = { accountId, positionId };
      db.prepare("INSERT INTO assets_requests VALUES(?,?,?,?,?)").run(
        userId,
        requestId,
        hash,
        JSON.stringify(result),
        now,
      );
      return result;
    })
    .immediate();
}
