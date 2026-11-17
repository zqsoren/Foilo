import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  accountTypes,
  banks,
  categories,
  currencies,
  groups,
  precision,
  today,
  typeFor,
  type AccountType,
  type Category,
  type Currency,
} from "@/lib/wealth/catalog";
import { decimal, parseMoney } from "@/lib/wealth/money";
import type { WealthData } from "@/lib/wealth/read";
import type { Save } from "./board";
import { AccountIcon } from "./list";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ax-toggle">
      <span>
        {label}
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ax-switch" aria-hidden="true" />
    </label>
  );
}
export function WealthEntryForm({
  data,
  accountId,
  save,
  busy,
}: {
  data: WealthData;
  accountId: number | null;
  save: Save;
  busy: boolean;
}) {
  const account = data.accounts.find((a) => a.id === accountId),
    fixedType = account ? typeFor(account.type_code) : undefined;
  const [group, setGroup] = useState(fixedType?.group ?? 0),
    [code, setCode] = useState(fixedType?.code ?? "alipay"),
    [search, setSearch] = useState("");
  const type = fixedType ?? typeFor(code)!;
  const choices = accountTypes.filter(
    (t) =>
      t.group === group && t.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="ax-entry-grid">
      <aside className="ax-card ax-category-list">
        <h2>账户分类</h2>
        <div>
          {groups.map((name, i) => (
            <button
              disabled={!!account || busy}
              aria-pressed={group === i}
              key={name}
              onClick={() => {
                setGroup(i);
                setCode(accountTypes.find((t) => t.group === i)!.code);
                setSearch("");
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {account && <p>正在向已有账户添加明细，账户类型保持不变。</p>}
      </aside>
      <section className="ax-card ax-choices">
        <div className="ax-section-heading">
          <h1>{account ? account.name : groups[group]}</h1>
          <small>
            {account
              ? "添加明细"
              : accountTypes.filter((t) => t.group === group).length +
                " 种账户"}
          </small>
        </div>
        {account ? (
          <div className="ax-existing">
            <AccountIcon code={account.type_code} />
            <h2>{account.name}</h2>
            <p>
              {[
                account.institution,
                account.card_last4 && "尾号 " + account.card_last4,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>每笔明细单独记录余额、币种和历史。账户总额由各笔明细计算。</p>
            <ul>
              {data.positions
                .filter((p) => p.account_id === account.id)
                .map((p) => (
                  <li key={p.id}>
                    {p.name}
                    <small>
                      {p.currency_code} · {categories[p.category_code]}
                    </small>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <>
            <input
              aria-label="搜索账户类型"
              placeholder="搜索账户类型"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="ax-choice-grid">
              {choices.map((t) => (
                <button
                  key={t.code}
                  disabled={busy}
                  aria-pressed={code === t.code}
                  onClick={() => setCode(t.code)}
                >
                  <AccountIcon code={t.code} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
            {!choices.length && (
              <div className="ax-empty">
                当前分类没有匹配类型
                <button onClick={() => setSearch("")}>清除搜索</button>
              </div>
            )}
          </>
        )}
      </section>
      <AccountForm
        key={account?.id ?? type.code}
        type={type}
        account={account}
        save={save}
        busy={busy}
      />
    </div>
  );
}
function AccountForm({
  type,
  account,
  save,
  busy,
}: {
  type: AccountType;
  account?: WealthData["accounts"][number];
  save: Save;
  busy: boolean;
}) {
  const [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState<Currency>("CNY"),
    [include, setInclude] = useState(true),
    [bookkeeping, setBookkeeping] = useState(true),
    [bank, setBank] = useState(""),
    [last4, setLast4] = useState(""),
    [date, setDate] = useState(today()),
    [category, setCategory] = useState<Category>(type.category),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      parseMoney(amount, currency);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const position = {
      name: account ? name : "账户余额",
      category,
      currency,
      include,
      amount,
      date,
      note: account ? note : "",
    };
    await save(
      account
        ? {
            type: "add",
            accountId: account.id,
            revision: account.revision,
            position,
          }
        : {
            type: "create",
            typeCode: type.code,
            name,
            note,
            institution: bank,
            cardLast4: last4,
            bookkeeping,
            position,
          },
    );
  }
  return (
    <form className="ax-card ax-account-form" onSubmit={submit}>
      <h2>{account ? "明细资料" : "账户资料"}</h2>
      <div className="ax-selected-type">
        <AccountIcon code={type.code} />
        <strong>{type.name}</strong>
      </div>
      <fieldset disabled={busy}>
        <label>
          {account ? "明细名称" : "账户名称"}
          <input
            required
            maxLength={80}
            placeholder={
              account ? "例如：人民币活期、美元存款" : type.name + " · 日常"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {account ? "明细备注（选填）" : "账户备注（选填）"}
          <textarea
            maxLength={500}
            rows={2}
            placeholder="写下用途或补充说明"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {type.bank && !account && (
          <div className="ax-field-pair">
            <label>
              所属银行
              <input
                list="wealth-banks"
                required
                maxLength={80}
                placeholder="选择或输入银行"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
              <datalist id="wealth-banks">
                {banks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label>
              卡号尾号
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="后4位，如0012"
                value={last4}
                onChange={(e) => setLast4(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="ax-field-pair">
          <label>
            {type.side === "liability" ? "当前欠款" : "账户余额 / 当前估值"}
            <input
              required
              inputMode={precision(currency) ? "decimal" : "numeric"}
              aria-describedby="wealth-amount-error"
              placeholder="请输入当前金额"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                if (amount) {
                  try {
                    parseMoney(amount, currency);
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            />
          </label>
          <label>
            账户币种
            <select
              aria-label="账户币种"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {Object.entries(currencies).map(([c, n]) => (
                <option key={c} value={c}>
                  {n} {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="ax-field-error" id="wealth-amount-error" role="alert">
            {error}
          </p>
        )}
        <div className="ax-field-pair">
          <label>
            资产类别
            <select
              aria-label="资产类别"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {Object.entries(categories)
                .filter(([c]) =>
                  type.side === "liability" ? c === "debt" : c !== "debt",
                )
                .map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
          <label>
            记录日期
            <input
              type="date"
              required
              min="1999-01-04"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {type.code === "insurance" && (
          <p className="ax-help">
            填写当前可计入资产的现金价值，不是保额或累计保费。
          </p>
        )}
        {["futures", "crypto", "stock", "fund", "gold"].includes(type.code) && (
          <p className="ax-help">
            填写该笔持仓的当前总估值；这里不自动获取行情，也不计算交易收益。
          </p>
        )}
        <Toggle
          label={"计入总" + (type.side === "liability" ? "负债" : "资产")}
          description="在财富总览中汇总这笔明细"
          checked={include}
          onChange={setInclude}
        />
        {!account && (
          <Toggle
            label="记账时可被选择"
            description="保存账户偏好，供后续记账功能使用"
            checked={bookkeeping}
            onChange={setBookkeeping}
          />
        )}
      </fieldset>
      <button className="ax-primary ax-save" disabled={busy} type="submit">
        {busy ? "正在保存…" : account ? "保存明细" : "保存账户"}
      </button>
    </form>
  );
}
export function BalanceDialog({
  data,
  positionId,
  busy,
  save,
  error,
  onRefresh,
  onClose,
}: {
  data: WealthData;
  positionId: number;
  busy: boolean;
  save: Save;
  error: string;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const p = data.positions.find((p) => p.id === positionId)!;
  const dialog = useRef<HTMLDialogElement>(null),
    [amount, setAmount] = useState(
      p.value ? decimal(p.value.amount_minor, p.currency_code) : "",
    ),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [localError, setLocalError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError("");
    try {
      parseMoney(amount, p.currency_code);
    } catch (e) {
      setLocalError((e as Error).message);
      return;
    }
    await save({
      type: "record",
      positionId: p.id,
      revision: p.revision,
      amount,
      date,
      note,
    });
  }
  return (
    <dialog
      className="ax-dialog"
      ref={dialog}
      aria-labelledby="wealth-record-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="ax-section-heading">
          <h2 id="wealth-record-title">更新这笔余额</h2>
          <button
            type="button"
            className="ax-icon-button"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          {p.name} · {p.currency_code}
        </p>
        <p className="ax-help">
          最新已记录：
          {p.value ? decimal(p.value.amount_minor, p.currency_code) : "暂无"} ·{" "}
          {p.value?.as_of_date}
        </p>
        <fieldset disabled={busy}>
          <label>
            {p.side === "liability" ? "当前欠款" : "当前余额 / 估值"}
            <input
              autoFocus
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            记录日期
            <input
              type="date"
              required
              min="1999-01-04"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            本次备注（选填）
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：月末核对"
            />
          </label>
        </fieldset>
        <p className="ax-help">
          新增一条余额记录，原有历史保留。同日再次记录时，以最后录入的余额为准。
        </p>
        {(localError || error) && (
          <p role="alert" className="ax-field-error">
            {localError || error}
          </p>
        )}
        {error && (
          <button type="button" disabled={busy} onClick={onRefresh}>
            刷新最新记录，保留填写内容
          </button>
        )}
        <button className="ax-primary ax-save" disabled={busy}>
          {busy ? "正在保存…" : "保存余额"}
        </button>
      </form>
    </dialog>
  );
}
