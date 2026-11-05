/** The one locale AMI formats in: its copy is English. */
export const LOCALE = "en-GB";

/** erp-api's money: a plain decimal string (ADR 0002), never a float. */
const AMOUNT = /^-?\d+(\.\d+)?$/;

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
