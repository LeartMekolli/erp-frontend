/**
 * The fake erp-api's quoting, shipping rates and placing, as the New order
 * page uses them. It keeps erp-api's rules (`quotes.service.ts`,
 * `quoteRequestSchema`; `orders.service.ts`, `place`, `refreshLapsed`,
 * `orderable`; `courier-response.ts:26-48`): a hidden product or another
 * customer's file is a 404, a speed the plan doesn't offer a 400 on
 * `delivery_speed`, a configuration that can't be priced a 200 with every
 * reason; a quote is ordered once, by its own customer, and one past its hold
 * is priced again before anything is placed. `partner_id` isn't faked: AMI
 * never sends it. Amounts are worked in whole cents, never fractions.
 */

import type {
  Address,
  Order,
  OrderLine,
  PlaceOrderBody,
  QuoteBody,
  QuoteRefusal,
  QuoteResult,
  QuoteSummary,
  ShippingRate,
  SummaryLabel,
} from "../../src/lib/api/schema-types";

import { CAST_RING_ID, GIFT_SET_ID, LUNA_LOGO_ID, NAMEPLATE_ID, type CatalogStore } from "./catalog";
import { workingDaysAfter, type Answer, type FieldError, type OrdersStore } from "./orders";

/** A file version as quoting needs it: whose file it is, and how far measuring has gone. */
export interface QuoteFile {
  fileId: string;
  name: string;
  owner: { type: string; id: string } | null;
  status: string;
}

/** The file version with this id, without moving it on through measuring. */
export type FindFileVersion = (versionId: string) => QuoteFile | null;

/** How long a quote's price holds (erp-api's default hold). */
const HOLD_MS = 48 * 3_600_000;
const CURRENCY = "EUR";

/** What a unit costs before the options: the fixed part of each summary line, in cents. */
const BASE_CENTS: Record<string, { material: number; making: number; finishing: number }> = {
  [CAST_RING_ID]: { material: 0, making: 2500, finishing: 0 },
  [NAMEPLATE_ID]: { material: 0, making: 500, finishing: 200 },
  [GIFT_SET_ID]: { material: 1200, making: 800, finishing: 400 },
  [LUNA_LOGO_ID]: { material: 0, making: 700, finishing: 300 },
};
const OTHER_PRODUCT = { material: 0, making: 1000, finishing: 0 };

/** What each material value adds to a unit's `material` line, in cents. */
const MATERIAL_CENTS: Record<string, number> = {
  silver_925: 4000,
  gold_18k: 18000,
  brass: 1500,
  resin_standard: 600,
  nylon_pa12: 800,
  pla: 400,
};

/** What each finish value adds to a unit's `finishing` line, in cents. */
const FINISH_CENTS: Record<string, number> = { polished: 1000, raw: 0 };

/** What each delivery speed adds to a unit, as its own `delivery_speed` line, in cents. */
const SPEED_CENTS: Record<string, number> = { express: 500 };

/** The rule that refuses Brass left Raw: it tarnishes unfinished. */
const BRASS_NEEDS_FINISH_RULE_ID = "a7a7a7a7-0000-4000-8000-000000000001";

/** The workspace's shipping methods, the same for every customer and address. */
const RATES: ShippingRate[] = [
  { key: "courier", name: "Courier", price: "12.00", available: true, reason: null },
  { key: "collect", name: "Collect", price: "0.00", available: true, reason: null },
  { key: "express_courier", name: "Express courier", price: null, available: false, reason: "No courier account is set up" },
];

/** Whole cents of a non-negative amount with up to two decimals. */
function cents(amount: string): number {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/** Non-negative whole cents as an amount with two decimals. */
const money = (total: number) => `${Math.floor(total / 100)}.${String(total % 100).padStart(2, "0")}`;

/** `amount` × 1.1, rounded half up to whole cents. */
const raised = (amount: number) => Math.floor((amount * 11 + 5) / 10);

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });
const notFound = (detail: string, errors?: FieldError[]): Answer<never> => ({ ok: false, status: 404, detail, ...(errors ? { errors } : {}) });

interface PriceLine {
  label: SummaryLabel;
  cents: number;
}

/** What a quote was priced from, kept so it can be priced again and made into an order line. */
interface Draft {
  customerId: string;
  product: QuoteSummary["product"];
  quantity: number;
  speed: string;
  /** One unit's summary lines; they add up to the unit price. */
  lines: PriceLine[];
  /** The whole quote, when it isn't the unit price × quantity (a price that changed). */
  totalCents?: number;
  made: Pick<OrderLine, "options" | "size" | "design_file">;
}

interface SavedQuote {
  draft: Draft;
  summary: QuoteSummary;
  ordered: boolean;
  /** Its hold has run out: placing it prices it again. */
  lapsed: boolean;
}

/** erp-api's idempotency: the same key and input replays; another input is a 409; failures release the key. */
function once<T>(seen: Map<string, { input: string; body: T }>, key: string | null, input: unknown, run: () => Answer<T>): Answer<T> {
  const serialised = JSON.stringify(input);
  const earlier = key ? seen.get(key) : undefined;
  if (earlier) {
    return earlier.input === serialised
      ? { ok: true, body: structuredClone(earlier.body) }
      : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
  }
  const answer = run();
  if (answer.ok && key) seen.set(key, { input: serialised, body: structuredClone(answer.body) });
  return answer;
}

export function createQuotesStore(now: () => number, catalog: CatalogStore, findFile: FindFileVersion, orders: OrdersStore) {
  const quotes = new Map<string, SavedQuote>();
  const quoteKeys = new Map<string, { input: string; body: QuoteResult }>();
  const placeKeys = new Map<string, { input: string; body: Order }>();

  function save(draft: Draft): SavedQuote {
    const unit = draft.lines.reduce((sum, line) => sum + line.cents, 0);
    const saved: SavedQuote = {
      draft,
      summary: {
        id: crypto.randomUUID(),
        product: { ...draft.product },
        quantity: draft.quantity,
        currency: CURRENCY,
        lines: draft.lines.map((line) => ({ label: line.label, amount: money(line.cents) })),
        unit_price: money(unit),
        total: money(draft.totalCents ?? unit * draft.quantity),
        expires_at: new Date(now() + HOLD_MS).toISOString(),
        expired: false,
      },
      ordered: false,
      lapsed: false,
    };
    quotes.set(saved.summary.id, saved);
    return saved;
  }

  /**
   * A lapsed quote priced again: the total × 1.1, rounded to cents, as a new saved quote. The unit
   * price rises the same way, its lines with it and `making` taking up the rounding.
   */
  function requote(previous: SavedQuote): SavedQuote {
    const unit = raised(cents(previous.summary.unit_price));
    const others = previous.draft.lines.filter((line) => line.label !== "making").map((line) => ({ ...line, cents: raised(line.cents) }));
    const making = unit - others.reduce((sum, line) => sum + line.cents, 0);
    const lines = previous.draft.lines.map((line) =>
      line.label === "making" ? { ...line, cents: making } : others.find((other) => other.label === line.label)!,
    );
    return save({ ...previous.draft, lines, totalCents: raised(cents(previous.summary.total)) });
  }

  function priceQuote(body: QuoteBody): Answer<QuoteResult> {
    if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1_000_000)
      return invalid("quantity", "must be a whole number from 1 to 1,000,000");
    const customerId = body.customer_id;
    if (customerId === undefined) return invalid("customer_id", "the fake prices quotes for a customer only");
    const customer = catalog.customer(customerId);
    if (!customer.ok) return customer;

    // The product must be one the customer can see, and the file one of its own.
    const visible = catalog.products(customerId, new URLSearchParams({ limit: "200" }));
    if (!visible.ok) return visible;
    const product = visible.body.data.find((candidate) => candidate.id === body.product_id);
    if (!product) return notFound("Product not found");
    let file: QuoteFile | null = null;
    if (body.file_version_id !== undefined) {
      file = findFile(body.file_version_id);
      if (!file || file.owner?.type !== "customer" || file.owner.id !== customerId) return notFound("File not found");
    }

    const speeds = catalog.speeds(customerId);
    if (!speeds.ok) return speeds;
    const speed =
      body.delivery_speed === undefined
        ? speeds.body.data.find((choice) => choice.is_default)
        : speeds.body.data.find((choice) => choice.key === body.delivery_speed);
    if (!speed) return invalid("delivery_speed", `${body.delivery_speed ?? "standard"} is not a delivery speed the customer's plan offers`);

    const reasons: QuoteRefusal[] = [];
    const groups = catalog.optionGroups();
    const allGroups = groups.ok ? groups.body.data : [];
    const offered = product.options.flatMap((option) => {
      const group = allGroups.find((candidate) => candidate.id === option.group_id);
      return group ? [{ option, group }] : [];
    });
    const given = body.options ?? {};
    for (const key of Object.keys(given)) {
      if (!offered.some(({ group }) => group.key === key))
        reasons.push({ code: "unknown_group", message: `${product.name} has no option ${key}` });
    }
    const picked: OrderLine["options"] = [];
    for (const { option, group } of offered) {
      const valueKey = given[group.key];
      const value =
        valueKey === undefined
          ? group.values.find((candidate) => candidate.id === option.default_value_id)
          : group.values.find((candidate) => candidate.key === valueKey);
      if (valueKey !== undefined && !value) {
        reasons.push({ code: "unknown_value", message: `${valueKey} is not a ${group.name.toLowerCase()}` });
      } else if (!value) {
        if (option.required) reasons.push({ code: "required_missing", message: `Pick a ${group.name.toLowerCase()}` });
      } else if (!option.value_ids.includes(value.id)) {
        reasons.push({ code: "value_not_offered", message: `${value.name} isn't offered for ${product.name}` });
      } else {
        picked.push({ group: { key: group.key, name: group.name }, value: { key: value.key, name: value.name } });
      }
    }
    const chose = (valueKey: string) => picked.some((choice) => choice.value.key === valueKey);
    if (chose("brass") && chose("raw"))
      reasons.push({ code: "rule_excludes", message: "Brass needs a finish: pick Polished", rule_id: BRASS_NEEDS_FINISH_RULE_ID });

    const size = body.size;
    if (size) {
      const sizing = product.sizing;
      if (sizing.mode === "range") {
        if (!("scale" in size)) {
          reasons.push({ code: "unknown_size", message: `${product.name} takes a scale, not a named size` });
        } else {
          const scale = Number(size.scale);
          if (!(scale >= Number(sizing.min) && scale <= Number(sizing.max)))
            reasons.push({ code: "size_out_of_range", message: `The scale must be from ${sizing.min} to ${sizing.max}` });
        }
      } else if (sizing.mode === "named") {
        if (!("named" in size) || !sizing.sizes.some((named) => named.key === size.named))
          reasons.push({ code: "unknown_size", message: `${product.name} comes in ${sizing.sizes.map((named) => named.key).join(", ")}` });
      } else {
        reasons.push({ code: "not_sizeable", message: `${product.name} comes in one size` });
      }
    }

    if (product.kind === "custom") {
      if (!file) reasons.push({ code: "file_required", message: `${product.name} is made from the customer's model: upload it first` });
      else if (file.status !== "measured") reasons.push({ code: "file_not_measured", message: "The model is still being measured" });
    }

    if (reasons.length > 0) return { ok: true, body: { accepted: false, reasons } };

    const base = BASE_CENTS[product.id] ?? OTHER_PRODUCT;
    const added = (table: Record<string, number>) => picked.reduce((sum, choice) => sum + (table[choice.value.key] ?? 0), 0);
    const lines: PriceLine[] = [
      { label: "material", cents: base.material + added(MATERIAL_CENTS) },
      { label: "making", cents: base.making },
      { label: "finishing", cents: base.finishing + added(FINISH_CENTS) },
    ];
    const surcharge = SPEED_CENTS[speed.key];
    if (surcharge !== undefined) lines.push({ label: "delivery_speed", cents: surcharge });

    const designFile = file
      ? { file_id: file.fileId, file_version_id: body.file_version_id!, name: file.name }
      : product.design_file
        ? { file_id: product.design_file.file_id, file_version_id: product.design_file.version_id, name: `${product.name}.stl` }
        : null;
    const saved = save({
      customerId,
      product: { id: product.id, name: product.name },
      quantity: body.quantity,
      speed: speed.key,
      lines,
      made: { options: picked, size: size ?? null, design_file: designFile },
    });
    return { ok: true, body: { accepted: true, quote: structuredClone(saved.summary) } };
  }

  function placeOrder(body: PlaceOrderBody, placedBy: { id: string; name: string }): Answer<Order> {
    if (body.lines.length === 0) return invalid("lines", "an order needs at least one line");
    if (body.note !== undefined && (body.note.length < 1 || body.note.length > 2000)) return invalid("note", "must be 1 to 2000 characters");

    // Every lapsed quote of the customer is priced again first; a changed price places nothing.
    // A simplification: the fake always answers 409 for a lapsed quote. Real erp-api places straight
    // away when the re-quoted total is unchanged (`orders.service.ts:1047-1049`).
    const lapsed = body.lines.flatMap((line, position) => {
      const quote = quotes.get(line.quote_id);
      return quote && quote.draft.customerId === body.customer_id && !quote.ordered && quote.lapsed ? [{ position, quote }] : [];
    });
    if (lapsed.length > 0) {
      return {
        ok: false,
        status: 409,
        code: "price_changed",
        detail: "The price changed since it was quoted",
        extensions: {
          lines: lapsed.map(({ position, quote }) => ({
            position,
            previous_quote_id: quote.summary.id,
            quote: structuredClone(requote(quote).summary),
            reasons: [],
          })),
        },
      };
    }

    const found = catalog.customer(body.customer_id);
    if (!found.ok) return found;
    const customer = found.body;
    const saved = catalog.addresses(body.customer_id);
    const address: Address | null = body.address ?? (saved.ok ? saved.body.shipping_address : null);
    if (!address) return invalid("address", "the customer has no saved shipping address");

    const picked: SavedQuote[] = [];
    for (let index = 0; index < body.lines.length; index += 1) {
      const quote = quotes.get(body.lines[index]!.quote_id);
      if (!quote || quote.draft.customerId !== body.customer_id)
        return notFound("Quote not found", [{ path: `lines.${index}.quote_id`, message: "not found" }]);
      if (quote.ordered || picked.includes(quote))
        return {
          ok: false,
          status: 409,
          detail: "A quote is ordered once",
          errors: [{ path: `lines.${index}`, message: "this quote has already been ordered" }],
        };
      picked.push(quote);
    }

    const speedKey = picked[0]!.draft.speed;
    if (picked.some((quote) => quote.draft.speed !== speedKey)) return invalid("lines", "the quotes name different delivery speeds");
    const rate = RATES.find((candidate) => candidate.key === body.shipping_method);
    const shippingPrice = rate?.available ? rate.price : null;
    if (!rate || shippingPrice === null) return invalid("shipping_method", `${body.shipping_method} can't be used for this order`);

    const speeds = catalog.speeds(body.customer_id);
    const workingDays = (speeds.ok ? speeds.body.data.find((choice) => choice.key === speedKey)?.working_days : undefined) ?? 5;
    const today = new Date(now()).toISOString().slice(0, 10);
    const linesTotal = picked.reduce((sum, quote) => sum + cents(quote.summary.total), 0);
    const payFirst = customer.payment_terms.terms === "pay_first";

    const order = orders.insert((number) => ({
      id: crypto.randomUUID(),
      number,
      customer: { id: customer.id, name: customer.name },
      channel: "staff",
      state: payFirst ? "awaiting_payment" : "in_production",
      promised_on: workingDaysAfter(today, workingDays),
      delivery_speed: speedKey,
      address: structuredClone(address),
      shipping: {
        method: { key: rate.key, name: rate.name },
        price: shippingPrice,
        courier: null,
        tracking: null,
        shipped_at: null,
        delivered_at: null,
        label: null,
      },
      lines: picked.map((quote, position) => ({
        id: crypto.randomUUID(),
        position,
        product: { ...quote.summary.product },
        quantity: quote.summary.quantity,
        unit_price: quote.summary.unit_price,
        total: quote.summary.total,
        ...structuredClone(quote.draft.made),
        state: "in_production" as const,
        group_id: null,
        partner: null,
        parts: [],
      })),
      lines_total: money(linesTotal),
      tax: { percent: "0.00", amount: "0.00" },
      total: money(linesTotal + cents(shippingPrice)),
      currency: CURRENCY,
      note: body.note ?? null,
      placed_at: new Date(now()).toISOString(),
      placed_by: { ...placedBy },
      cancelled: null,
      payment: {
        terms: customer.payment_terms.terms,
        state: payFirst ? "awaiting_payment" : "not_billed",
        pay_by: null,
        held_for_credit: false,
        released: null,
        paid: "0.00",
        refunded: "0.00",
        refundable: "0.00",
        pay_url: null,
        invoice: null,
      },
    }));
    for (const quote of picked) quote.ordered = true;
    return { ok: true, body: order };
  }

  return {
    /** `POST /pricing/quotes`: a saved quote (the handler answers 201), or every reason it can't be priced (200). */
    quote(body: QuoteBody, key: string | null = null): Answer<QuoteResult> {
      return once(quoteKeys, key, body, () => priceQuote(body));
    },

    /** `POST /orders/shipping-rates`: the workspace's methods, the same to any address. */
    rates(customerId: string): Answer<{ data: ShippingRate[] }> {
      const customer = catalog.customer(customerId);
      if (!customer.ok) return customer;
      return { ok: true, body: { data: structuredClone(RATES) } };
    },

    /** `POST /orders`: the customer's quotes, each ordered once, as a new order in the orders store. */
    place(body: PlaceOrderBody, placedBy: { id: string; name: string }, key: string | null = null): Answer<Order> {
      return once(placeKeys, key, body, () => placeOrder(body, placedBy));
    },

    /** Test switch: every saved quote's hold runs out, so the next place prices it again at × 1.1. */
    expireQuotes(): void {
      for (const quote of quotes.values()) {
        quote.lapsed = true;
        quote.summary = { ...quote.summary, expired: true };
      }
    },
  };
}

export type QuotesStore = ReturnType<typeof createQuotesStore>;
