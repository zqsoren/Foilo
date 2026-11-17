import type Database from "better-sqlite3";
import { today } from "./catalog";
import { exchangeRates, type RateSet } from "./fx";
import { toCny } from "./money";
import { readLedger, type Ledger, type Valuation } from "./store";

export function latestValues(ledger: Ledger, date: string) {
  const values = new Map<number, Valuation>();
  for (const v of ledger.valuations) {
    const old = values.get(v.position_id);
    if (
      v.as_of_date <= date &&
      (!old ||
        v.as_of_date > old.as_of_date ||
        (v.as_of_date === old.as_of_date && v.id > old.id))
    )
      values.set(v.position_id, v);
  }
  return values;
}
export function valueAt(ledger: Ledger, date: string, fx: RateSet) {
  const values = latestValues(ledger, date);
  const positions = ledger.positions.map((p) => {
    const value = values.get(p.id);
    const cny = !value
      ? null
      : p.currency_code === "CNY"
        ? String(value.amount_minor)
        : fx.rates.CNY && fx.rates[p.currency_code]
          ? toCny(
              value.amount_minor,
              p.currency_code,
              fx.rates.CNY,
              fx.rates[p.currency_code],
            )
          : null;
    return { ...p, value: value ?? null, cny };
  });
  let assets = 0n,
    liabilities = 0n,
    missing = 0;
  for (const p of positions)
    if (p.include_in_totals && p.value) {
      if (p.cny === null) missing++;
      else if (p.side === "asset") assets += BigInt(p.cny);
      else liabilities += BigInt(p.cny);
    }
  return {
    positions,
    assets: assets.toString(),
    liabilities: liabilities.toString(),
    net: (assets - liabilities).toString(),
    missing,
  };
}
export function trendDates(date: string) {
  const [y, m] = date.split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) =>
    i === 5
      ? date
      : new Date(Date.UTC(y, m - 5 + i, 0)).toISOString().slice(0, 10),
  );
}
export async function readWealth(
  db: Database.Database,
  userId: number,
  fetcher: typeof fetch = fetch,
  date = today(),
) {
  const ledger = readLedger(db, userId),
    dates = trendDates(date);
  const foreign = ledger.positions.some((p) => p.currency_code !== "CNY");
  const noFx: RateSet = {
    date: "",
    rates: { CNY: "1" },
    cached: false,
    unavailable: false,
  };
  const fx = foreign ? await exchangeRates(db, "latest", fetcher) : noFx;
  const current = valueAt(ledger, date, fx);
  const trend = await Promise.all(
    dates.map(async (d) => {
      const values = latestValues(ledger, d);
      const recorded = ledger.positions.some(
        (p) => p.include_in_totals && values.has(p.id),
      );
      if (!recorded)
        return { date: d, net: null, rateDate: "", unavailable: false };
      const needsFx = ledger.positions.some(
        (p) =>
          p.include_in_totals && p.currency_code !== "CNY" && values.has(p.id),
      );
      const rates =
        d === date ? fx : needsFx ? await exchangeRates(db, d, fetcher) : noFx;
      const totals = valueAt(ledger, d, rates);
      return {
        date: d,
        net: totals.missing ? null : totals.net,
        rateDate: rates.date,
        unavailable: rates.unavailable,
      };
    }),
  );
  return { ...ledger, ...current, trend, fx, date };
}
export type WealthData = Awaited<ReturnType<typeof readWealth>>;
