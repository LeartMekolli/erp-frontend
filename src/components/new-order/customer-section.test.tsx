import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { LUNA_ID, MIRA_ID, ORDER_TAKER, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
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

/** Types `text` in the search, presses New customer under "No customer matches", and returns the panel. */
async function openNewCustomer(text = "Atelier Nord") {
  await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), text);
  await userEvent.click(await screen.findByRole("button", { name: `New customer “${text}”` }));
  return screen.findByRole("dialog", { name: "New customer" });
}

const panelSection = (panel: HTMLElement, name: string) => within(panel).getByRole("region", { name });

async function fillShipping(panel: HTMLElement) {
  const shipping = panelSection(panel, "Shipping address");
  await userEvent.type(within(shipping).getByLabelText("Name"), "Atelier Nord");
  await userEvent.type(within(shipping).getByLabelText("Address line 1"), "Storgata 4");
  await userEvent.type(within(shipping).getByLabelText("City"), "Oslo");
  await userEvent.type(within(shipping).getByLabelText("Postal code"), "0155");
  await userEvent.type(within(shipping).getByLabelText("Country"), "NO");
}

/** The fake API's customers with this exact name. */
const named = (name: string) => fakeState().catalog.names().filter((customer) => customer.name === name);

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

  describe("New customer", () => {
    it("offers New customer when the search finds nobody, with the text typed", async () => {
      renderAs(STAFF, <Harness />);
      await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Atelier Nord");
      expect(await screen.findByText("No customer matches “Atelier Nord”.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New customer “Atelier Nord”" })).toBeInTheDocument();
    });

    it("isn't offered to staff who can't make customers", async () => {
      const { client } = renderAs(ORDER_TAKER, <Harness />);
      await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Atelier Nord");
      expect(await screen.findByText("No customer matches “Atelier Nord”.")).toBeInTheDocument();
      // Who they are is known by now, so the button's absence is the permission's doing.
      await waitFor(() => expect(client.getQueryData(["me"])).toBeDefined());
      expect(screen.queryByRole("button", { name: /^New customer/ })).not.toBeInTheDocument();
    });

    it("picks the new customer and keeps the order", async () => {
      renderAs(STAFF, <Harness />);
      // Entered before any customer, as the model's unit is: picking the new customer keeps it.
      await userEvent.click(screen.getByRole("button", { name: "Draw in cm" }));
      const panel = await openNewCustomer();
      expect(panel).toHaveAccessibleDescription("Picked for this order once it's created. The order stays as it is.");
      expect(within(panelSection(panel, "Customer")).getByLabelText("Name")).toHaveValue("Atelier Nord");

      await fillShipping(panel);
      await userEvent.click(within(panel).getByRole("button", { name: "Create customer" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const chip = await screen.findByRole("group", { name: "Customer" });
      expect(within(chip).getByText("Atelier Nord")).toBeInTheDocument();
      await waitFor(() => expect(changeButton()).toHaveFocus());
      expect(named("Atelier Nord")).toHaveLength(1);
      const id = named("Atelier Nord")[0]?.id;
      await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${id} product: quantity:1 unit:cm`));
    });

    it("asks before closing the panel with anything typed", async () => {
      renderAs(STAFF, <Harness />);
      const panel = await openNewCustomer();

      await userEvent.keyboard("{Escape}");
      const question = await within(panel).findByRole("alertdialog", { name: "Discard this customer?" });
      await waitFor(() => expect(within(question).getByRole("button", { name: "Keep editing" })).toHaveFocus());

      // Keep editing: the panel stays with what was typed.
      await userEvent.click(within(question).getByRole("button", { name: "Keep editing" }));
      expect(within(panel).queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "New customer" })).toBeInTheDocument();
      expect(within(panelSection(panel, "Customer")).getByLabelText("Name")).toHaveValue("Atelier Nord");

      // Escape while it asks answers Keep editing too: the question goes, focus is on Cancel, the panel stays.
      await userEvent.keyboard("{Escape}");
      await within(panel).findByRole("alertdialog", { name: "Discard this customer?" });
      await userEvent.keyboard("{Escape}");
      expect(within(panel).queryByRole("alertdialog")).not.toBeInTheDocument();
      await waitFor(() => expect(within(panel).getByRole("button", { name: "Cancel" })).toHaveFocus());
      expect(screen.getByRole("dialog", { name: "New customer" })).toBeInTheDocument();
      expect(within(panelSection(panel, "Customer")).getByLabelText("Name")).toHaveValue("Atelier Nord");

      // Discard: the panel goes, focus is back in the search, and nobody was made.
      await userEvent.keyboard("{Escape}");
      await userEvent.click(await within(panel).findByRole("button", { name: "Discard" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Customer" })).toHaveFocus());
      expect(named("Atelier Nord")).toHaveLength(0);
    });

    it("finds the new customer when the same text is searched again", async () => {
      renderAs(STAFF, <Harness />);
      const panel = await openNewCustomer();
      await userEvent.click(within(panel).getByRole("button", { name: "Create customer" }));
      await waitFor(() => expect(changeButton()).toHaveFocus());

      // The search for this text had answered "no match"; Create made it ask again.
      await userEvent.click(changeButton());
      await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Atelier Nord");
      expect(await screen.findByRole("option", { name: "Atelier Nord" })).toBeInTheDocument();
      expect(screen.queryByText("No customer matches “Atelier Nord”.")).not.toBeInTheDocument();
    });

    it("says the invitation wasn't sent when the workspace has no customer site", async () => {
      fakeState().catalog.setInvitationEmail("no_customer_site");
      renderAs(STAFF, <Harness />);
      const panel = await openNewCustomer();
      await userEvent.type(within(panelSection(panel, "First person (optional)")).getByLabelText("Email"), "sofia@atelier.example");
      await userEvent.click(within(panel).getByRole("button", { name: "Create customer" }));

      await screen.findByRole("group", { name: "Customer" });
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Atelier Nord was created."));
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent("The invitation to sofia@atelier.example wasn't sent");
      // Send again sits beside the live region, not inside it, so the announcement stays text only.
      expect(screen.getByRole("button", { name: "Send again" })).toBeInTheDocument();

      // Another customer picked: the notice was about Atelier Nord and goes.
      await userEvent.click(changeButton());
      await pick("Luna", "Luna Jewels");
      await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID}`));
      expect(screen.queryByText("Atelier Nord was created.")).not.toBeInTheDocument();
    });

    /** Luna set with a product entered, then Atelier Nord made in the panel with Sofia invited: picking them asks. */
    async function createOverAStartedOrder() {
      renderAs(STAFF, <Harness />);
      await pickLuna();
      await userEvent.click(screen.getByRole("button", { name: "Enter a product" }));
      await userEvent.click(changeButton());
      const panel = await openNewCustomer();
      await userEvent.type(within(panelSection(panel, "First person (optional)")).getByLabelText("Email"), "sofia@atelier.example");
      await userEvent.click(within(panel).getByRole("button", { name: "Create customer" }));
      return screen.findByRole("dialog", { name: "Change the customer?" });
    }

    /** Keep: the order stays Luna's, and the panel stays with Atelier Nord's notice, focused. */
    async function keep(question: HTMLElement) {
      await userEvent.click(within(question).getByRole("button", { name: "Keep" }));
      // Once the question has gone, the panel is no longer hidden behind it.
      const panel = await screen.findByRole("dialog", { name: "New customer" });
      const notice = within(panel).getByRole("status");
      await waitFor(() => expect(notice).toHaveTextContent("Atelier Nord was created."));
      await waitFor(() => expect(notice.parentElement).toHaveFocus());
      return { panel, notice };
    }

    it("on Keep, still says in the panel that the customer was made, with a link to them, and closes without asking", async () => {
      fakeState().catalog.setInvitationEmail("no_customer_site");
      const question = await createOverAStartedOrder();
      const { panel, notice } = await keep(question);

      expect(screen.getByTestId("values")).toHaveTextContent(`customer:${LUNA_ID} product:ring`);
      expect(panel).toHaveAccessibleDescription("The order keeps its customer unless you use this one.");
      expect(notice).toHaveTextContent("The invitation to sofia@atelier.example wasn't sent");
      expect(within(panel).getByRole("button", { name: "Send again" })).toBeInTheDocument();
      // A new tab, so New order's leave guard never comes into it.
      const link = within(panel).getByRole("link", { name: "Open Atelier Nord (opens in a new tab)" });
      expect(link).toHaveAttribute("href", `/customers/${named("Atelier Nord")[0]?.id}`);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");

      // Close: nothing typed is lost, so it never asks to discard; focus is back on the kept chip's Change.
      await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(changeButton()).toHaveFocus());
      expect(within(screen.getByRole("group", { name: "Customer" })).getByText("Luna Jewels")).toBeInTheDocument();
      expect(screen.queryByText("Atelier Nord was created.")).not.toBeInTheDocument();
      expect(named("Atelier Nord")).toHaveLength(1);
    });

    it("on Keep, Escape closes the panel without asking", async () => {
      const { panel } = await keep(await createOverAStartedOrder());
      expect(panel).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(changeButton()).toHaveFocus());
    });

    it("uses the kept customer for the order later, with Send again's answer under their chip", async () => {
      fakeState().catalog.setInvitationEmail("no_customer_site");
      const { panel, notice } = await keep(await createOverAStartedOrder());

      fakeState().catalog.setInvitationEmail("queued");
      await userEvent.click(within(panel).getByRole("button", { name: "Send again" }));
      await waitFor(() => expect(notice).toHaveTextContent("An invitation is on its way to sofia@atelier.example."));

      // Use for this order asks again, over the panel, as any pick does.
      await userEvent.click(within(panel).getByRole("button", { name: "Use for this order" }));
      const again = await screen.findByRole("dialog", { name: "Change the customer?" });
      await userEvent.click(within(again).getByRole("button", { name: "Change customer" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const id = named("Atelier Nord")[0]?.id;
      await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent(`customer:${id} product: quantity:1`));
      expect(within(screen.getByRole("group", { name: "Customer" })).getByText("Atelier Nord")).toBeInTheDocument();
      await waitFor(() => expect(changeButton()).toHaveFocus());
      // The notice moved under the chip and kept Send again's answer.
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("An invitation is on its way to sofia@atelier.example."));
      expect(screen.getByRole("status")).not.toHaveTextContent("wasn't sent");
      expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
    });
  });
});
