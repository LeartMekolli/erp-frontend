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
  leave: {
    title: "Leave this order?",
    text: "What you've entered here will be lost.",
    leave: "Leave",
    stay: "Stay",
  },
} as const;
