import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CustomerGroupChoice } from "@/lib/api/schema-types";
import { addressesValues, EMPTY_NEW_CUSTOMER, type AddressesValues, type CustomerValues, type TermsValues } from "@/lib/customers/form";

import { AddressesFields, InvoicesFields, ShippingFields } from "./addresses-fields";
import { CustomerFields } from "./customer-fields";
import { PersonFields } from "./person-fields";
import { useAddressesForm, useCustomerForm, useNewCustomerForm, useTermsForm } from "./section-forms";
import { TermsFields } from "./terms-fields";

const TRADE: CustomerGroupChoice = { id: "a4a4a4a4-0000-4000-8000-000000000010", key: "trade", name: "Trade" };

function Addresses({ start }: { start: AddressesValues }) {
  const form = useAddressesForm(start);
  return (
    <FormProvider {...form}>
      <AddressesFields />
    </FormProvider>
  );
}

function Terms({ start }: { start: TermsValues }) {
  const form = useTermsForm(start);
  return (
    <FormProvider {...form}>
      <TermsFields currency="EUR" />
    </FormProvider>
  );
}

function NewCustomer({ children }: { children: ReactNode }) {
  const form = useNewCustomerForm(EMPTY_NEW_CUSTOMER);
  return <FormProvider {...form}>{children}</FormProvider>;
}

const LUNA: CustomerValues = { name: "Luna Jewels", groupId: TRADE.id, mayPickPartner: true };

function Customer({ groups }: { groups: CustomerGroupChoice[] | null }) {
  const form = useCustomerForm(LUNA);
  return (
    <FormProvider {...form}>
      <CustomerFields groups={groups} />
    </FormProvider>
  );
}

describe("the customer form's sections", () => {
  it("opens a billing address when Bill to the shipping address is unticked", async () => {
    render(<Addresses start={addressesValues({ shipping_address: null, billing_address: null, vat_number: null })} />);
    expect(screen.getByRole("checkbox", { name: "Bill to the shipping address" })).toBeChecked();
    expect(screen.queryByRole("group", { name: "Billing address" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Bill to the shipping address" }));
    const billing = screen.getByRole("group", { name: "Billing address" });
    expect(within(billing).getByLabelText("Address line 1")).toBeInTheDocument();
    expect(screen.getByLabelText("VAT number (optional)")).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText("VAT number (optional)")).toHaveAttribute("maxLength", "40");
  });

  it("asks for a valid email only once one is typed, and offers four roles with Owner first", async () => {
    render(<NewCustomer>{<PersonFields />}</NewCustomer>);
    const email = screen.getByLabelText("Email");
    await userEvent.click(email);
    await userEvent.tab();
    expect(screen.queryByText("Enter an email such as name@example.com")).not.toBeInTheDocument();

    await userEvent.type(email, "sofia");
    await userEvent.tab();
    expect(await screen.findByText("Enter an email such as name@example.com")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");

    const role = screen.getByLabelText("Role");
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Owner", "Admin", "Buyer", "Viewer"]);
    expect(role).toHaveValue("owner");
    expect(screen.getByText("They'll get an email to set up their access, once the customer is created.")).toBeInTheDocument();
  });

  it("shows the shipping and invoice sections on their own", () => {
    const { unmount } = render(
      <NewCustomer>
        <ShippingFields />
      </NewCustomer>,
    );
    expect(screen.getByRole("group", { name: "Shipping address" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bill to the shipping address" })).not.toBeInTheDocument();
    unmount();

    render(
      <NewCustomer>
        <InvoicesFields />
      </NewCustomer>,
    );
    expect(screen.queryByRole("group", { name: "Shipping address" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bill to the shipping address" })).toBeInTheDocument();
    expect(screen.getByLabelText("VAT number (optional)")).toBeInTheDocument();
  });

  it("hides days and limit for pay first, and keeps them for going back", async () => {
    render(<Terms start={{ terms: "pay_later", daysToPay: "45", creditLimit: "5000.00" }} />);
    expect(screen.getByLabelText("Days to pay")).toHaveValue("45");
    expect(screen.getByText("Work starts without waiting for payment, which is due within the days to pay.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Pay first" }));
    expect(screen.getByText("Each order waits for payment before work starts.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Days to pay")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Credit limit (optional)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Pay later" }));
    expect(screen.getByLabelText("Days to pay")).toHaveValue("45");
    expect(screen.getByLabelText("Credit limit (optional)")).toHaveValue("5000.00");
  });

  it("says what saving pay first clears, only when the saved terms are pay later", async () => {
    const clears = "Saving pay first clears the days to pay and the credit limit. To go back to pay later, you'll enter them again.";
    const { unmount } = render(<Terms start={{ terms: "pay_later", daysToPay: "30", creditLimit: "" }} />);
    expect(screen.queryByText(clears)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Pay first" }));
    expect(screen.getByText(clears)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Terms" })).toHaveAccessibleDescription(`Each order waits for payment before work starts. ${clears}`);
    unmount();

    render(<Terms start={{ terms: "pay_first", daysToPay: "30", creditLimit: "" }} />);
    await userEvent.click(screen.getByRole("radio", { name: "Pay later" }));
    await userEvent.click(screen.getByRole("radio", { name: "Pay first" }));
    expect(screen.queryByText(clears)).not.toBeInTheDocument();
  });

  it("says how to write a credit limit once the field is left", async () => {
    render(<Terms start={{ terms: "pay_later", daysToPay: "30", creditLimit: "" }} />);
    const limit = screen.getByLabelText("Credit limit (optional)");
    await userEvent.type(limit, "5,000.00");
    expect(screen.queryByText("Enter an amount such as 5000.00")).not.toBeInTheDocument();
    await userEvent.tab();
    expect(await screen.findByText("Enter an amount such as 5000.00")).toBeInTheDocument();
    expect(limit).toHaveAttribute("aria-invalid", "true");
  });

  it("offers No group, and no group picker when the groups can't be read", () => {
    const { unmount } = render(<Customer groups={[TRADE]} />);
    const picker = screen.getByLabelText("Customer group (optional)");
    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual(["No group", "Trade"]);
    expect(picker).toHaveValue(TRADE.id);
    unmount();
    render(<Customer groups={null} />);
    expect(screen.queryByLabelText("Customer group (optional)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Luna Jewels");
  });

  it("asks for a name once the field is left empty, and stops once one is typed", async () => {
    render(<Customer groups={null} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.tab();
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "Luna");
    await waitFor(() => expect(screen.queryByText("Enter a name")).not.toBeInTheDocument());
  });
});
