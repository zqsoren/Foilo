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
  bookkeeping_enabled: number;
  deleted_at: number | null;
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
const positionSchema = z.object({
  name: text,
  category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
  currency: z.enum(Object.keys(currencies) as [Currency, ...Currency[]]),
  include: z.boolean(),
  bookkeeping: z.boolean().optional(),
  amount: z.string().max(30),
  date,
  note,
});
const identity = {
  typeCode: z.string().max(40),
  name: z.string().trim().max(80),
  note,
  institution: z.string().trim().max(80),
  cardLast4: z.string().regex(/^(\d{4})?$/, "请输入4位卡号尾号"),
};
const accountRef = {
  accountId: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
};
const positionRef = {
  positionId: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
};
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create-account"), ...identity }),
  z.object({ type: z.literal("edit-account"), ...identity, ...accountRef }),
  z.object({
    type: z.literal("add-assets"),
    ...accountRef,
    positions: z
      .array(positionSchema)
      .min(1, "请添加一笔资产")
      .max(50, "一次最多保存50笔资产"),
  }),
  z.object({ type: z.literal("delete-asset"), ...positionRef }),
  z.object({
    type: z.literal("edit-asset"),
    ...positionRef,
    name: text,
    include: z.boolean(),
    bookkeeping: z.boolean(),
  }),
  // Keep in-flight requests from the previous release compatible.
  z.object({
    type: z.literal("create"),
    ...identity,
    name: text,
    bookkeeping: z.boolean(),
    position: positionSchema,
  }),
  z.object({ type: z.literal("add"), ...accountRef, position: positionSchema }),
  z.object({
    type: z.literal("record"),
    ...positionRef,
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
        "SELECT id,account_id,name,category_code,side,currency_code,include_in_totals,bookkeeping_enabled,deleted_at,revision,created_at,updated_at FROM assets_positions WHERE user_id=? AND deleted_at IS NULL ORDER BY id",
      )
      .all(userId) as Position[],
    valuations: db
      .prepare(
        "SELECT id,position_id,as_of_date,amount_minor,note,recorded_at FROM assets_valuations WHERE user_id=? AND position_id IN (SELECT id FROM assets_positions WHERE deleted_at IS NULL) ORDER BY as_of_date DESC,id DESC",
      )
      .all(userId) as Valuation[],
  };
}
function insertPosition(
  db: Database.Database,
  userId: number,
  a: Pick<Account, "id" | "type_code">,
  p: z.infer<typeof positionSchema>,
  now: number,
) {
  const type = typeFor(a.type_code);
  if (!type || (type.side === "liability") !== (p.category === "debt"))
    throw Error("资产与负债类别不匹配");
  const amount = parseMoney(p.amount, p.currency);
  const id = Number(
    db
      .prepare(
        "INSERT INTO assets_positions(user_id,account_id,name,category_code,side,currency_code,include_in_totals,bookkeeping_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        userId,
        a.id,
        p.name,
        p.category,
        type.side,
        p.currency,
        Number(p.include),
        Number(p.bookkeeping ?? p.category === "cash"),
        now,
        now,
      ).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,note,recorded_at) VALUES(?,?,?,?,?,?)",
  ).run(userId, id, p.date, amount, p.note, now);
  return id;
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
      let accountId: number,
        positionId = 0;
      if (
        command.type === "record" ||
        command.type === "delete-asset" ||
        command.type === "edit-asset"
      ) {
        const p = db
          .prepare(
            "SELECT * FROM assets_positions WHERE id=? AND user_id=? AND deleted_at IS NULL",
          )
          .get(command.positionId, userId) as Position | undefined;
        if (!p) throw Error("找不到这笔资产");
        if (p.revision !== command.revision)
          throw Error("此资产已在另一页面更新，请刷新后核对再保存");
        if (command.type === "record") {
          const amount = parseMoney(command.amount, p.currency_code);
          db.prepare(
            "INSERT INTO assets_valuations(user_id,position_id,as_of_date,amount_minor,note,recorded_at) VALUES(?,?,?,?,?,?)",
          ).run(userId, p.id, command.date, amount, command.note, now);
        } else if (command.type === "delete-asset") {
          db.prepare(
            "UPDATE assets_positions SET deleted_at=? WHERE id=? AND user_id=?",
          ).run(now, p.id, userId);
        } else {
          db.prepare(
            "UPDATE assets_positions SET name=?,include_in_totals=?,bookkeeping_enabled=? WHERE id=? AND user_id=?",
          ).run(
            command.name,
            Number(command.include),
            Number(command.bookkeeping),
            p.id,
            userId,
          );
        }
        db.prepare(
          "UPDATE assets_positions SET revision=revision+1,updated_at=? WHERE id=? AND user_id=?",
        ).run(now, p.id, userId);
        accountId = p.account_id;
        positionId = p.id;
      } else if (
        command.type === "create-account" ||
        command.type === "create" ||
        command.type === "edit-account"
      ) {
        const type = typeFor(command.typeCode);
        if (!type) throw Error("请选择有效账户类型");
        if (
          type.bank &&
          (!command.institution ||
            command.institution === "其他银行" ||
            !command.cardLast4)
        )
          throw Error("请填写所属银行和4位卡号尾号");
        const name = type.bank
          ? `${command.institution} · 尾号${command.cardLast4}`
          : command.name;
        if (!name) throw Error("请填写账户名称");
        if (command.type === "edit-account") {
          const a = db
            .prepare("SELECT * FROM assets_accounts WHERE id=? AND user_id=?")
            .get(command.accountId, userId) as Account | undefined;
          if (!a) throw Error("找不到这个账户");
          if (a.revision !== command.revision)
            throw Error("此账户已在另一页面更新，请刷新后核对再保存");
          if (a.type_code !== type.code) throw Error("已有账户不能更改类型");
          accountId = a.id;
          db.prepare(
            "UPDATE assets_accounts SET name=?,note=?,institution=?,card_last4=? WHERE id=? AND user_id=?",
          ).run(
            name,
            command.note,
            type.bank ? command.institution : "",
            type.bank ? command.cardLast4 : "",
            a.id,
            userId,
          );
        } else {
          accountId = Number(
            db
              .prepare(
                "INSERT INTO assets_accounts(user_id,type_code,institution,name,note,card_last4,bookkeeping_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
              )
              .run(
                userId,
                type.code,
                type.bank ? command.institution : "",
                name,
                command.note,
                type.bank ? command.cardLast4 : "",
                command.type === "create" ? Number(command.bookkeeping) : 0,
                now,
                now,
              ).lastInsertRowid,
          );
          if (command.type === "create")
            positionId = insertPosition(
              db,
              userId,
              { id: accountId, type_code: type.code },
              command.position,
              now,
            );
        }
      } else {
        const a = db
          .prepare("SELECT * FROM assets_accounts WHERE id=? AND user_id=?")
          .get(command.accountId, userId) as Account | undefined;
        if (!a) throw Error("找不到这个账户");
        if (a.revision !== command.revision)
          throw Error("此账户已在另一页面更新，请刷新后核对再保存");
        accountId = a.id;
        for (const p of command.type === "add-assets"
          ? command.positions
          : [command.position])
          positionId = insertPosition(db, userId, a, p, now);
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
