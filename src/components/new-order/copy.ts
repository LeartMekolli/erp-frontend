import type { SummaryLabel } from "@/lib/api/schema-types";
import { LOCALE } from "@/lib/format/money";
import type { AddressField, PriceBlocker } from "@/lib/new-order/form";

/** Fixed words on the New order page. */
export const COPY = {
  title: "New order",
  cancel: "Cancel",
  /** The link above the title, back to the orders list. */
  back: "Orders",
  customer: {
    label: "Customer",
    placeholder: "Search customers by name",
    searching: "Searching…",
    loading: "Loading the customer…",
    searchFailed: "Couldn't search customers.",
    loadFailed: "Couldn't load the customer.",
    noMatch: (text: string) => `No customer matches “${text}”.`,
    disabled: (name: string) => `${name} is disabled. Pick another customer.`,
    noGroup: "No group",
    change: "Change",
    /** Change's accessible name: it starts with the visible word, and isn't confused with the address's Change. */
    changeLabel: "Change the customer",
  },
  /** Asked before another customer clears what was entered for this one. */
  changeCustomer: {
    title: "Change the customer?",
    text: "The product, options, price and delivery will be cleared. The model stays and uploads again for the new customer.",
    keep: "Keep",
    change: "Change customer",
  },
  product: {
    label: "Product",
    placeholder: "Pick a product",
    loading: "Loading the products…",
    loadFailed: "Couldn't load the products.",
    none: "This customer has no products to order.",
    theirOwn: "Their own",
    optionsLoading: "Loading the options…",
    optionsFailed: "Couldn't load the options.",
    noChoice: "None",
    size: "Size",
    sizePlaceholder: "Pick a size",
    sizeHint: (min: string, max: string) => `Between ${min} and ${max}`,
    sizePick: "Pick a size.",
    sizeRange: (min: string, max: string) => `Enter a size between ${min} and ${max}.`,
    quantity: "Quantity",
    quantityError: "Enter a whole number from 1 to 1,000,000.",
    less: "Less",
    more: "More",
    speed: "Speed",
    /** Shown only while no speed is set: the plan has no default and more than one to pick from. */
    speedPlaceholder: "Pick a speed",
    speedsLoading: "Loading the delivery speeds…",
    speedsFailed: "Couldn't load the delivery speeds.",
    workingDays: (days: number) => `${days} working ${days === 1 ? "day" : "days"}`,
  },
  model: {
    label: "Model",
    unit: "Drawn in",
    units: { mm: "mm", cm: "cm", m: "m", in: "in" },
    /** The drop zone's input name for screen readers; its visible words are `drop`. */
    upload: "Upload a model",
    drop: "Drop the model here, or choose a file",
    waiting: "Uploads when you pick the customer.",
    notUsed: "This product doesn't use a model.",
    remove: "Remove",
    replace: "Replace file",
    measures: { volume: "Volume", size: "Size (W × D × H)", surface: "Surface" },
    noAccess: "You can't upload the model. Ask an admin for file access.",
  },
  price: {
    get: "Get price",
    getting: "Getting a price…",
    /** erp-api's summary line labels, as the customer would read them. */
    lines: {
      material: "Material",
      making: "Making",
      finishing: "Finishing",
      quantity_discount: "Quantity discount",
      your_discount: "Customer discount",
      plan_discount: "Plan discount",
      delivery_speed: "Delivery speed",
    } satisfies Record<SummaryLabel, string>,
    unitPrice: "Unit price",
    /** "2 × €75.00": the quantity times the unit price, beside the quote's total. */
    times: (quantity: string, unitPrice: string) => `${quantity} × ${unitPrice}`,
    expired: "Price expired. Placing gets a new price.",
    changed: "The price changed since it was quoted. Check the new price, then place the order.",
    refused: "This can't be priced:",
    offline: "You're offline.",
  },
  delivery: {
    title: "Delivery",
    address: "Address",
    saved: "(saved)",
    change: "Change",
    useSaved: "Use the saved address",
    addressLoading: "Loading the saved address…",
    addressFailed: "Couldn't load the saved address.",
    fields: {
      name: "Name",
      line1: "Address line 1",
      line2: "Address line 2 (optional)",
      city: "City",
      postal_code: "Postal code",
      region: "Region (optional)",
      country: "Country",
      phone: "Phone (optional)",
    } satisfies Record<AddressField, string>,
    countryHint: "Two letters, such as FR",
    problems: {
      missing: "Fill this in.",
      country: "Enter two letters, such as FR.",
      tooLong: (max: number) => `Use at most ${max} characters.`,
    },
    shipping: "Shipping",
    needsAddress: "Fill in the address to see the shipping methods.",
    ratesLoading: "Loading the shipping methods…",
    ratesFailed: "Couldn't load the shipping methods.",
    noRates: "No shipping methods are set up.",
    method: (name: string, price: string) => `${name} · ${price}`,
    note: "Note",
    noteCount: (length: number) => `${length.toLocaleString(LOCALE)} / 2,000`,
    total: "Total before tax",
    place: "Place order",
    placing: "Placing…",
    checkFields: "Check the marked fields.",
    offline: "You're offline.",
    /** Why Place order is off, when it is neither offline, loading nor placing. */
    fillAddress: "Fill in the address first.",
    pickMethod: "Pick a shipping method.",
  },
  ticket: {
    /** The accessible name of the column beside the work. */
    label: "Order",
    /** Why Get price is off, the first that applies (`priceBlocker`). */
    blocked: {
      customer: "Pick the customer first.",
      product: "Pick a product.",
      model: "Add the model first.",
      measuring: "Wait for the model to be measured.",
      size: "Pick a size.",
    } satisfies Record<PriceBlocker, string>,
    getNewPrice: "Get new price",
    /** The total's label while no shipping method is picked. */
    beforeShipping: "Before shipping and tax",
    noPrice: "No price yet",
    /** Under the struck-through total of a price the form no longer matches. */
    changed: "Changed: get a new price",
    /** Opens the whole ticket from the bar at the bottom of a narrow screen. */
    details: "See details",
    /** "2 × Cast ring". */
    what: (quantity: string, product: string) => `${quantity} × ${product}`,
    /** A size picked from a range, in the line of chosen values. */
    size: (scale: string) => `Size ${scale}`,
    holds: (time: string) => `Price holds until ${time}`,
    paysFirst: (name: string) => `Pays first. The order waits for ${name}'s payment before production starts.`,
    paysLater: (days: number) =>
      `Pays later, ${days} ${days === 1 ? "day" : "days"}. Production starts when it's placed, unless they're over their credit limit.`,
  },
  leave: {
    title: "Leave this order?",
    text: "What you've entered here will be lost.",
    leave: "Leave",
    stay: "Stay",
  },
} as const;
