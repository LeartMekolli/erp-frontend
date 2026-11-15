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
