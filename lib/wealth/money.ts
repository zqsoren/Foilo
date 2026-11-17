import { precision } from "./catalog";

// Integer minor units in storage and decimal strings at the client boundary.
export function parseMoney(value: string, currency: string): number {
  const p = precision(currency);
  const pattern = p ? /^\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}$/;
  if (!pattern.test(value.trim()))
    throw Error(
      p
        ? "金额须为非负数，最多两位小数和12位整数"
        : "该币种金额须为非负整数，最多12位",
    );
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(
    BigInt(whole) * 10n ** BigInt(p) + BigInt(fraction.padEnd(p, "0") || "0"),
  );
}
export function decimal(minor: string | number, currency = "CNY") {
  const p = precision(currency),
    n = BigInt(minor),
    sign = n < 0n ? "-" : "",
    digits = (n < 0n ? -n : n).toString().padStart(p + 1, "0");
  return sign + (p ? digits.slice(0, -p) + "." + digits.slice(-p) : digits);
}
export function money(minor: string | number | null, currency = "CNY") {
  if (minor === null) return "待折算";
  const [whole, fraction] = decimal(minor, currency).split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction === undefined ? "" : "." + fraction)
  );
}
function rational(rate: string) {
  if (!/^\d+(\.\d{1,12})?$/.test(rate) || Number(rate) <= 0)
    throw Error("汇率无效");
  const [a, b = ""] = rate.split(".");
  return [BigInt(a + b), 10n ** BigInt(b.length)] as const;
}
// ECB rates share EUR as a base. Cross conversion avoids rounding the reciprocal first.
export function toCny(
  minor: number,
  currency: string,
  cnyPerEuro: string,
  unitsPerEuro: string,
) {
  if (currency === "CNY") return String(minor);
  const [cn, cd] = rational(cnyPerEuro),
    [un, ud] = rational(unitsPerEuro);
  const numerator = BigInt(minor) * 100n * cn * ud;
  const denominator = 10n ** BigInt(precision(currency)) * cd * un;
  return ((numerator + denominator / 2n) / denominator).toString();
}
