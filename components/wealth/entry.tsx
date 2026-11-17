import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import Image from "next/image";
import { X, ChevronDown, Plus } from "lucide-react";
import {
  accountTypes,
  banks,
  bankIcon,
  accountName,
  defaultAccountNames,
  platformCodes,
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
import { decimal, money, parseMoney } from "@/lib/wealth/money";
import type { WealthData } from "@/lib/wealth/read";
import type { Save } from "./board";
import { AccountIcon, DeleteAssetIcon } from "./list";
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ax-toggle">
      <span>{label}</span>
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
function BankPicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [search, setSearch] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ax-dialog ax-bank-dialog"
      aria-labelledby="bank-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="ax-section-heading">
        <h2 id="bank-title">选择所属银行</h2>
        <button type="button" aria-label="关闭银行选择" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <label>
        搜索银行
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索银行"
        />
      </label>
      <div className="ax-bank-grid">
        {banks
          .filter((b) => b.includes(search) || b === "其他银行")
          .map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={b === value}
              onClick={() => {
                onChange(b);
                onClose();
              }}
            >
              <Image
                src={bankIcon(b)}
                width={40}
                height={40}
                className="ax-account-icon"
                alt=""
                unoptimized
              />
              {b}
            </button>
          ))}
      </div>
    </dialog>
  );
}
export function WealthEntryForm({
  data,
  accountId,
  save,
  busy,
  onDirty,
}: {
  data: WealthData;
  accountId: number | null;
  save: Save;
  busy: boolean;
  onDirty: (v: boolean) => void;
}) {
  const account = data.accounts.find((a) => a.id === accountId),
    fixedType = account ? typeFor(account.type_code) : undefined;
  const [group, setGroup] = useState(fixedType?.group ?? 0),
    [code, setCode] = useState(fixedType?.code ?? "alipay"),
    [search, setSearch] = useState("");
  const dirty = useRef(false),
    type = fixedType ?? typeFor(code)!;
  const activeGroup = fixedType?.group ?? group;
  const choices = accountTypes.filter(
    (t) =>
      t.group === activeGroup &&
      t.name.toLowerCase().includes(search.toLowerCase()),
  );
  function choose(g: number, c: string) {
    if (dirty.current && !window.confirm("放弃尚未保存的内容？")) return;
    dirty.current = false;
    onDirty(false);
    setGroup(g);
    setCode(c);
    setSearch("");
  }
  const changeDirty = useCallback(
    (v: boolean) => {
      dirty.current = v;
      onDirty(v);
    },
    [onDirty],
  );
  return (
    <div className="ax-entry-grid">
      <aside className="ax-card ax-category-list">
        <h2>账户分类</h2>
        <div>
          {groups.map((name, i) => (
            <button
              disabled={!!account || busy}
              aria-pressed={activeGroup === i}
              key={name}
              onClick={() =>
                choose(i, accountTypes.find((t) => t.group === i)!.code)
              }
            >
              {name}
            </button>
          ))}
        </div>
      </aside>
      <section className="ax-card ax-choices">
        <div className="ax-section-heading">
          <h1>{groups[activeGroup]}</h1>
        </div>
        <input
          aria-label="搜索账户类型"
          placeholder="搜索账户类型"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(activeGroup === 3 ? [true, false] : [null]).map((platform) => (
          <div key={String(platform)}>
            {platform !== null && (
              <h2 className="ax-choice-section">
                {platform ? "理财平台" : "其他记录方式"}
              </h2>
            )}
            <div className="ax-choice-grid">
              {choices
                .filter(
                  (t) =>
                    platform === null ||
                    platformCodes.includes(t.code) === platform,
                )
                .map((t) => (
                  <button
                    key={t.code}
                    disabled={busy || !!account}
                    aria-pressed={type.code === t.code}
                    onClick={() => choose(activeGroup, t.code)}
                  >
                    <AccountIcon code={t.code} />
                    <span>{t.name}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {!choices.length && <div className="ax-empty">没有匹配的账户类型</div>}
      </section>
      <AccountForm
        key={account?.id ?? type.code}
        type={type}
        account={account}
        data={data}
        save={save}
        busy={busy}
        onDirty={changeDirty}
      />
    </div>
  );
}
type Draft = {
  key: string;
  name: string;
  amount: string;
  currency: Currency;
  category: Category;
  date: string;
  include: boolean;
  bookkeeping: boolean;
  touched: boolean;
  modified: boolean;
};
function draftFor(type: AccountType): Draft {
  return {
    key: crypto.randomUUID(),
    name: "",
    amount: "",
    currency: "CNY",
    category: type.category,
    date: today(),
    include: true,
    bookkeeping: type.category === "cash",
    touched: false,
    modified: false,
  };
}
function AccountForm({
  type,
  account,
  data,
  save,
  busy,
  onDirty,
}: {
  type: AccountType;
  account?: WealthData["accounts"][number];
  data: WealthData;
  save: Save;
  busy: boolean;
  onDirty: (v: boolean) => void;
}) {
  const [name, setName] = useState(
      account?.name ?? defaultAccountNames[type.code] ?? "",
    ),
    [note, setNote] = useState(account?.note ?? ""),
    [bank, setBank] = useState(account?.institution ?? ""),
    [last4, setLast4] = useState(account?.card_last4 ?? "");
  const [editing, setEditing] = useState(false),
    [bankOpen, setBankOpen] = useState(false),
    [otherBank, setOtherBank] = useState(
      !!account?.institution && !banks.includes(account.institution),
    );
  const [identityDirty, setIdentityDirty] = useState(false),
    [drafts, setDrafts] = useState<Draft[]>(() =>
      account ? [draftFor(type)] : [],
    ),
    [expanded, setExpanded] = useState(0),
    [error, setError] = useState("");
  const creating = !account || editing;
  const assetDirty =
    drafts.length > 1 || drafts.some((d) => d.name || d.amount || d.modified);
  useEffect(() => {
    onDirty(identityDirty || assetDirty);
    return () => onDirty(false);
  }, [identityDirty, assetDirty, onDirty]);
  const positions = account
    ? data.positions.filter((p) => p.account_id === account.id)
    : [];
  function update(index: number, patch: Partial<Draft>) {
    setDrafts((ds) =>
      ds.map((d, i) => (i === index ? { ...d, ...patch, modified: true } : d)),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (creating) {
      if (type.bank && (!bank || bank === "其他银行")) {
        setError("请选择或填写所属银行");
        return;
      }
      const fields = {
        typeCode: type.code,
        name,
        note,
        institution: bank,
        cardLast4: last4,
      };
      const ok = await save(
        account
          ? {
              type: "edit-account",
              accountId: account.id,
              revision: account.revision,
              ...fields,
            }
          : { type: "create-account", ...fields },
      );
      if (ok) {
        setIdentityDirty(false);
        setEditing(false);
        onDirty(assetDirty);
      }
      return;
    }
    try {
      for (const [i, d] of drafts.entries()) {
        if (!d.name.trim()) throw Error(`请填写资产 ${i + 1} 的名称`);
        parseMoney(d.amount, d.currency);
        if (!d.date || d.date > today())
          throw Error(`请检查资产 ${i + 1} 的记录日期`);
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!drafts.length) {
      setError("请添加一笔资产");
      return;
    }
    const ok = await save({
      type: "add-assets",
      accountId: account!.id,
      revision: account!.revision,
      positions: drafts.map((d) => ({
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        category: d.category,
        date: d.date,
        include: d.include,
        bookkeeping: d.bookkeeping,
        note: "",
      })),
    });
    if (ok) onDirty(false);
  }
  return (
    <form
      className={`ax-card ax-account-form ${creating ? "ax-create-account" : "ax-add-assets"}`}
      onSubmit={submit}
    >
      <div className="ax-steps">
        <span className={creating ? "is-active" : ""}>新建账户</span>
        <span aria-hidden="true">›</span>
        <span className={!creating ? "is-active" : ""}>添加资产</span>
      </div>
      {creating ? (
        <>
          <div className="ax-selected-type">
            <AccountIcon code={type.code} />
            <strong>{type.name}</strong>
          </div>
          <fieldset disabled={busy} onChange={() => setIdentityDirty(true)}>
            {type.bank ? (
              <>
                <label>
                  所属银行
                  <button
                    className="ax-bank-trigger"
                    type="button"
                    onClick={() => setBankOpen(true)}
                  >
                    {bank && (
                      <Image
                        src={bankIcon(bank)}
                        width={32}
                        height={32}
                        alt=""
                        unoptimized
                      />
                    )}
                    <span>{bank || "选择银行"}</span>
                    <ChevronDown size={14} />
                  </button>
                </label>
                {otherBank && (
                  <label>
                    银行名称
                    <input
                      required
                      maxLength={80}
                      value={bank === "其他银行" ? "" : bank}
                      onChange={(e) => setBank(e.target.value)}
                      placeholder="填写银行名称"
                    />
                  </label>
                )}
                <label>
                  卡号尾号
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="后4位"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                账户名称
                <input
                  required
                  maxLength={80}
                  placeholder="请输入账户名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              账户备注（选填）
              <textarea
                maxLength={500}
                rows={1}
                placeholder="填写备注"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </fieldset>
          {error && (
            <p className="ax-field-error" role="alert">
              {error}
            </p>
          )}
          <button className="ax-primary ax-save" type="submit" disabled={busy}>
            {busy ? "正在保存…" : "保存账户"}
          </button>
          {account && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setName(account.name);
                setNote(account.note);
                setBank(account.institution);
                setLast4(account.card_last4);
                setIdentityDirty(false);
                setEditing(false);
              }}
            >
              取消修改
            </button>
          )}
        </>
      ) : (
        <>
          <div className="ax-account-summary">
            <AccountIcon code={type.code} institution={account.institution} />
            <div>
              <h2>{accountName(account)}</h2>
              {account.note && <p>{account.note}</p>}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setName(account.name);
                setNote(account.note);
                setBank(account.institution);
                setLast4(account.card_last4);
                setEditing(true);
              }}
            >
              修改账户信息
            </button>
          </div>
          <h2>账户内资产</h2>
          <fieldset disabled={busy}>
            {positions.map((p) => (
              <div className="ax-asset-item" key={p.id}>
                <div className="ax-asset-heading">
                  <h2>{p.name}</h2>
                  <button
                    type="button"
                    className="ax-trash"
                    aria-label={`删除${p.name}`}
                    onClick={async () => {
                      if (window.confirm(`删除“${p.name}”？`))
                        await save({
                          type: "delete-asset",
                          positionId: p.id,
                          revision: p.revision,
                        });
                    }}
                  >
                    <DeleteAssetIcon />
                  </button>
                </div>
                <p>
                  {p.currency_code}{" "}
                  {money(p.value?.amount_minor ?? null, p.currency_code)} ·{" "}
                  {categories[p.category_code]}
                </p>
              </div>
            ))}
            {drafts.map((d, i) => (
              <section className="ax-asset-item" key={d.key}>
                <div className="ax-asset-heading">
                  <button
                    type="button"
                    className="ax-asset-expand"
                    aria-expanded={expanded === i}
                    onClick={() => setExpanded(i)}
                  >
                    <h2>
                      资产 {positions.length + i + 1}
                      {expanded !== i && d.name ? ` · ${d.name}` : ""}
                    </h2>
                  </button>
                  <button
                    type="button"
                    className="ax-trash"
                    aria-label={`删除资产 ${positions.length + i + 1}`}
                    onClick={() => {
                      setDrafts((ds) => ds.filter((x) => x.key !== d.key));
                      setExpanded(Math.max(0, i - 1));
                    }}
                  >
                    <DeleteAssetIcon />
                  </button>
                </div>
                {expanded !== i ? (
                  <p>
                    {d.currency} {d.amount || "—"} · {categories[d.category]}
                  </p>
                ) : (
                  <div className="ax-asset-fields">
                    <label>
                      资产名称
                      <input
                        required
                        maxLength={80}
                        placeholder="请输入资产名称"
                        value={d.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </label>
                    <div className="ax-field-pair ax-amount-pair">
                      <label>
                        {type.side === "liability"
                          ? "当前欠款"
                          : "余额 / 当前估值"}
                        <input
                          required
                          inputMode={
                            precision(d.currency) ? "decimal" : "numeric"
                          }
                          placeholder="请输入当前金额"
                          value={d.amount}
                          onChange={(e) =>
                            update(i, { amount: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        币种
                        <select
                          aria-label="币种"
                          value={d.currency}
                          onChange={(e) =>
                            update(i, { currency: e.target.value as Currency })
                          }
                        >
                          {Object.entries(currencies).map(([c, n]) => (
                            <option key={c} value={c}>
                              {n} {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="ax-field-pair">
                      <label>
                        资产类别
                        <select
                          aria-label="资产类别"
                          value={d.category}
                          onChange={(e) => {
                            const category = e.target.value as Category;
                            update(i, {
                              category,
                              ...(!d.touched
                                ? { bookkeeping: category === "cash" }
                                : {}),
                            });
                          }}
                        >
                          {Object.entries(categories)
                            .filter(([c]) =>
                              type.side === "liability"
                                ? c === "debt"
                                : c !== "debt",
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
                          required
                          type="date"
                          min="1999-01-04"
                          max={today()}
                          value={d.date}
                          onChange={(e) => update(i, { date: e.target.value })}
                        />
                      </label>
                    </div>
                    <Toggle
                      label={`计入总${type.side === "liability" ? "负债" : "资产"}`}
                      checked={d.include}
                      onChange={(include) => update(i, { include })}
                    />
                    <Toggle
                      label="记账时可被选择"
                      checked={d.bookkeeping}
                      onChange={(bookkeeping) =>
                        update(i, { bookkeeping, touched: true })
                      }
                    />
                  </div>
                )}
              </section>
            ))}
          </fieldset>
          {error && (
            <p className="ax-field-error" role="alert">
              {error}
            </p>
          )}
          <div className="ax-asset-actions">
            <button
              type="button"
              disabled={busy || drafts.length >= 50}
              onClick={() => {
                setDrafts((ds) => [...ds, draftFor(type)]);
                setExpanded(drafts.length);
              }}
            >
              <Plus size={16} />
              添加一笔资产
            </button>
            <button
              className="ax-primary"
              type="submit"
              disabled={busy || !drafts.length}
            >
              {busy ? "正在保存…" : "保存资产"}
            </button>
          </div>
        </>
      )}
      {bankOpen && (
        <BankPicker
          value={bank}
          onClose={() => setBankOpen(false)}
          onChange={(b) => {
            setBank(b);
            setOtherBank(b === "其他银行");
            setIdentityDirty(true);
          }}
        />
      )}
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
          {p.value
            ? decimal(p.value.amount_minor, p.currency_code)
            : "暂无"} · {p.value?.as_of_date}
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
              placeholder="填写备注"
            />
          </label>
        </fieldset>

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
