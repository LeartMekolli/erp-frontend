/** The one locale AMI formats in: its copy is English. */
export const LOCALE = "en-GB";

/** erp-api's money: a plain decimal string (ADR 0002), never a float. */
const AMOUNT = /^-?\d+(\.\d+)?$/;

/** An amount's sign, read from the string so no digit passes through a float. `-0.00` is 0. */
export function signOf(amount: string): -1 | 0 | 1 {
  if (!AMOUNT.test(amount)) throw new Error(`Not a money amount: ${JSON.stringify(amount)}`);
  if (!/[1-9]/.test(amount)) return 0;
  return amount.startsWith("-") ? -1 : 1;
}

/**
 * The exact sum of two amounts, with as many decimals as the longer one. Both
 * are scaled to whole units as BigInt, so no digit passes through a float.
 * A zero sum has no minus sign. (BigInt() calls, not `0n`: the target is ES2017.)
 */
export function addMoney(a: string, b: string): string {
  for (const amount of [a, b]) {
    if (!AMOUNT.test(amount)) throw new Error(`Not a money amount: ${JSON.stringify(amount)}`);
  }
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const toUnits = (amount: string): bigint => {
    const [whole, fraction = ""] = amount.replace("-", "").split(".");
    const units = BigInt(whole + fraction.padEnd(scale, "0"));
    return amount.startsWith("-") ? -units : units;
  };
  const sum = toUnits(a) + toUnits(b);
  const negative = sum < BigInt(0);
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * An amount in its own currency, rounded half up to the currency's minor
 * unit. The string goes to Intl as it is, so no digit passes through a float.
 */
export function formatMoney(amount: string, currency: string): string {
  if (!AMOUNT.test(amount)) throw new Error(`Not a money amount: ${JSON.stringify(amount)}`);
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(amount as Intl.StringNumericLiteral);
}
