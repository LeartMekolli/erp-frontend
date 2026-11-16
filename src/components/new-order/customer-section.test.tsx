import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { CustomerSection } from "./customer-section";

/** The section inside a form, with what the form holds written out so a test can read it. */
function Harness({ initial }: { initial?: Partial<NewOrderValues> }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, ...initial } });
  const [customerId, productId, quantity] = useWatch({ control: form.control, name: ["customerId", "productId", "quantity"] });
  return (
    <FormProvider {...form}>
      <CustomerSection />
      <p data-testid="values">{`customer:${customerId} product:${productId} quantity:${quantity}`}</p>
    </FormProvider>
  );
}

async function pick(search: string, name: string) {
  await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), search);
  await userEvent.click(await screen.findByRole("option", { name }));
}

describe("CustomerSection", () => {
  it("shows Luna's summary", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pick("Luna", "Luna Jewels");
    expect(await screen.findByText("Group: Trade · Pays first · Plan: Free")).toBeInTheDocument();
    expect(screen.getByText("Luna Jewels", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID}`));
  });

  it("shows Mira pays later", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pick("Mira", "Mira Studio");
    // The fake puts Mira on Starter, not Free.
    expect(await screen.findByText("No group · Pays later, 30 days · Plan: Starter")).toBeInTheDocument();
  });

  it("won't take a disabled customer", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pick("Old Works", "Old Works");
    expect(await screen.findByText("Old Works is disabled. Pick another customer.")).toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent("customer: product:");
    expect(screen.queryByText(/Plan:/)).not.toBeInTheDocument();
  });

  it("changing the customer clears the product", async () => {
    renderAs(ORDER_TAKER, <Harness initial={{ customerId: LUNA_ID, productId: "ring", quantity: "5" }} />);
    expect(await screen.findByText("Group: Trade · Pays first · Plan: Free")).toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID} product:ring quantity:5`);

    await pick("Mira", "Mira Studio");
    expect(await screen.findByText("No group · Pays later, 30 days · Plan: Starter")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${MIRA_ID} product: quantity:1`));
  });

  it("says when no customer matches", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "zzz");
    expect(await screen.findByText("No customer matches “zzz”.")).toBeInTheDocument();
  });
});
