/** Fixed words on the New order page. */
export const COPY = {
  title: "New order",
  cancel: "Cancel",
  sections: {
    customer: "Customer",
    product: "Product",
    price: "Price",
    delivery: "Delivery",
  },
  /** Shown under the title of a section that isn't open yet. */
  closed: {
    product: "Pick a customer first.",
    price: "Fill in the product first.",
    delivery: "Get a price first.",
  },
  customer: {
    label: "Customer",
    placeholder: "Search customers by name",
    searching: "Searching…",
    loading: "Loading the customer…",
    searchFailed: "Couldn't search customers.",
    loadFailed: "Couldn't load the customer.",
    noMatch: (text: string) => `No customer matches “${text}”.`,
    disabled: (name: string) => `${name} is disabled. Pick another customer.`,
  },
  leave: {
    title: "Leave this order?",
    text: "What you've entered here will be lost.",
    leave: "Leave",
    stay: "Stay",
  },
} as const;
