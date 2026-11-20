import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { CustomerSection } from "./customer-section";

/**
 * The section inside a form, with what the form holds written out so a test can read it, and two buttons
 * that enter something the way the other panels would (marking the field changed).
 */
function Harness({ onCustomerChange }: { onCustomerChange?: () => void }) {
  const form = useForm<NewOrderValues>({ defaultValues: EMPTY_VALUES });
  const [customerId, productId, quantity, declaredUnit] = useWatch({
    control: form.control,
    name: ["customerId", "productId", "quantity", "declaredUnit"],
  });
  return (
    <FormProvider {...form}>
      <CustomerSection onCustomerChange={onCustomerChange} />
      <button type="button" onClick={() => form.setValue("productId", "ring", { shouldDirty: true })}>
        Enter a product
      </button>
      <button type="button" onClick={() => form.setValue("declaredUnit", "cm", { shouldDirty: true })}>
        Draw in cm
      </button>
      <p data-testid="values">{`customer:${customerId} product:${productId} quantity:${quantity} unit:${declaredUnit}`}</p>
    </FormProvider>
  );
}

async function pick(search: string, name: string) {
  await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), search);
  await userEvent.click(await screen.findByRole("option", { name }));
}

/** Picks Luna and waits for her chip. */
async function pickLuna() {
  await pick("Luna", "Luna Jewels");
  await screen.findByRole("group", { name: "Customer" });
  await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID}`));
}

const changeButton = () => screen.getByRole("button", { name: "Change the customer" });

describe("CustomerSection", () => {
  it("shows the picked customer as a chip", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pickLuna();
    const chip = screen.getByRole("group", { name: "Customer" });
    expect(within(chip).getByText("Luna Jewels")).toBeInTheDocument();
    expect(within(chip).getByText("Trade · Free")).toBeInTheDocument();
    expect(within(chip).getByRole("button", { name: "Change the customer" })).toHaveTextContent(/^Change/);
    // The chip replaces the search; the name isn't repeated anywhere else.
    expect(screen.queryByRole("combobox", { name: "Customer" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Luna Jewels")).toHaveLength(1);
  });

  it("shows Mira's group and plan", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pick("Mira", "Mira Studio");
    // The fake puts Mira on Starter, with no group.
    expect(await screen.findByText("No group · Starter")).toBeInTheDocument();
  });

  it("Change shows the search again", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pickLuna();
    await userEvent.click(changeButton());
    const box = await screen.findByRole("combobox", { name: "Customer" });
    expect(box).toHaveValue("");
    await waitFor(() => expect(box).toHaveFocus());
    expect(screen.queryByRole("group", { name: "Customer" })).not.toBeInTheDocument();

    // Escape goes back to the same customer, with focus on Change.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(changeButton()).toHaveFocus());
    expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID}`);
  });

  it("won't take a disabled customer", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await pick("Old Works", "Old Works");
    expect(await screen.findByText("Old Works is disabled. Pick another customer.")).toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent("customer: product:");
    expect(screen.queryByRole("group", { name: "Customer" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Customer" })).toBeInTheDocument();
  });

  it("asks before changing once a product is picked", async () => {
    const onCustomerChange = vi.fn();
    renderAs(ORDER_TAKER, <Harness onCustomerChange={onCustomerChange} />);
    await pickLuna();
    await userEvent.click(screen.getByRole("button", { name: "Enter a product" }));
    await userEvent.click(changeButton());
    await pick("Mira", "Mira Studio");

    const dialog = await screen.findByRole("dialog", { name: "Change the customer?" });
    expect(dialog).toHaveTextContent(
      "The product, options, price and delivery will be cleared. The model stays and uploads again for the new customer.",
    );
    // Keep is the main button, so the safe choice is the black one.
    expect(within(dialog).getByRole("button", { name: "Keep" })).toHaveAttribute("data-variant", "primary");
    expect(within(dialog).getByRole("button", { name: "Change customer" })).toHaveAttribute("data-variant", "outline");
    // Nothing changes until it's answered.
    expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID} product:ring`);
    expect(onCustomerChange).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Change customer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("No group · Starter")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${MIRA_ID} product: quantity:1`));
    expect(onCustomerChange).toHaveBeenCalledTimes(1);
    // Focus lands on Mira's chip, never on the page body (the page's product select takes it after).
    await waitFor(() => expect(changeButton()).toHaveFocus());
  });

  it("won't clear the order for a disabled customer", async () => {
    const onCustomerChange = vi.fn();
    renderAs(ORDER_TAKER, <Harness onCustomerChange={onCustomerChange} />);
    await pickLuna();
    await userEvent.click(screen.getByRole("button", { name: "Enter a product" }));
    await userEvent.click(changeButton());
    await pick("Old Works", "Old Works");

    // Their record is read before asking: disabled, so no question and nothing cleared.
    expect(await screen.findByText("Old Works is disabled. Pick another customer.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID} product:ring`);
    expect(onCustomerChange).not.toHaveBeenCalled();

    // Escape in the search goes back to Luna, and the message goes with it.
    await userEvent.click(screen.getByRole("combobox", { name: "Customer" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(changeButton()).toHaveFocus());
    expect(screen.queryByText("Old Works is disabled. Pick another customer.")).not.toBeInTheDocument();
  });

  it("Keep leaves everything as it was", async () => {
    const onCustomerChange = vi.fn();
    renderAs(ORDER_TAKER, <Harness onCustomerChange={onCustomerChange} />);
    await pickLuna();
    await userEvent.click(screen.getByRole("button", { name: "Enter a product" }));
    await userEvent.click(changeButton());
    await pick("Mira", "Mira Studio");

    await userEvent.click(await screen.findByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByRole("group", { name: "Customer" })).getByText("Luna Jewels")).toBeInTheDocument();
    await waitFor(() => expect(changeButton()).toHaveFocus());
    expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID} product:ring`);
    expect(onCustomerChange).not.toHaveBeenCalled();
  });

  it("changes without asking when only the customer is set", async () => {
    const onCustomerChange = vi.fn();
    renderAs(ORDER_TAKER, <Harness onCustomerChange={onCustomerChange} />);
    await pickLuna();
    // The unit stays with the model, so having changed it isn't worth asking about.
    await userEvent.click(screen.getByRole("button", { name: "Draw in cm" }));
    await userEvent.click(changeButton());
    await pick("Mira", "Mira Studio");

    expect(await screen.findByText("No group · Starter")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${MIRA_ID} product: quantity:1 unit:cm`));
    expect(onCustomerChange).toHaveBeenCalledTimes(1);
  });

  it("says when no customer matches", async () => {
    renderAs(ORDER_TAKER, <Harness />);
    await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "zzz");
    expect(await screen.findByText("No customer matches “zzz”.")).toBeInTheDocument();
  });
});
