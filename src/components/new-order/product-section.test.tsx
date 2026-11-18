import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CatalogProduct, OptionGroup } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { ProductSection, type RefusedField, type Refusals } from "./product-section";
import { useModel } from "./use-model";

const NO_REFUSALS: Refusals = new Map();

/** The section inside a form, with what the form holds written out so a test can read it. */
function Harness({ customerId, refusals = NO_REFUSALS }: { customerId: string; refusals?: Refusals }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, customerId } });
  const model = useModel({ customerId, declaredUnit: "mm" });
  const [productId, options, speed] = useWatch({ control: form.control, name: ["productId", "options", "speed"] });
  return (
    <FormProvider {...form}>
      <ProductSection refusals={refusals} model={model} />
      <p data-testid="values">{JSON.stringify({ productId, options, speed })}</p>
    </FormProvider>
  );
}

/** Picks a product once the select is ready: it waits for the option groups, which the defaults need. */
async function pickProduct(name: string) {
  const select = await screen.findByRole("combobox", { name: "Product" });
  await waitFor(() => expect(select).toBeEnabled());
  await userEvent.selectOptions(select, name);
}

describe("ProductSection", () => {
  it("lists Luna's own product as Their own", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    expect(await screen.findByRole("option", { name: "Luna logo stand · Their own" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cast ring" })).toBeInTheDocument();
  });

  it("chooses the default options", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Cast ring");

    expect(await screen.findByRole("radio", { name: "Silver 925" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Gold 18k" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Polished" })).toBeChecked();
    // Finish is optional but starts on Polished, and erp-api prices a group left out as its default: no "None".
    expect(screen.queryByRole("radio", { name: "None" })).not.toBeInTheDocument();
    expect(screen.getByText("Between 0.5 and 3")).toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent('"options":{"metal":"silver_925","finish":"polished"}');

    // Luna's plan offers two speeds; the default is checked.
    expect(await screen.findByRole("radio", { name: "Standard · 5 working days" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Express · 2 working days" })).not.toBeChecked();
  });

  it("drops the last product's options when the product changes", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Cast ring");
    await screen.findByRole("radio", { name: "Silver 925" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Product" }), "Nameplate");

    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent('"options":{"print_material":"resin_standard"}'));
    expect(screen.queryByRole("radio", { name: "Silver 925" })).not.toBeInTheDocument();
  });

  it("uses a select above six values", async () => {
    const values = ["a", "b", "c", "d", "e", "f", "g"].map((key) => ({
      id: `value-${key}`,
      group_id: "group-alloy",
      key,
      name: `Alloy ${key}`,
      material_id: null,
    }));
    const group: OptionGroup = { id: "group-alloy", key: "alloy", name: "Alloy", values };
    const product: CatalogProduct = {
      id: "product-bracelet",
      category_id: "category-bracelets",
      key: "bracelet",
      name: "Bracelet",
      kind: "ready_made",
      status: "active",
      material_id: null,
      sizing: { mode: "none" },
      design_file: null,
      options: [{ group_id: group.id, required: true, default_value_id: "value-b", value_ids: values.map((value) => value.id) }],
      published: true,
      customer_id: null,
      parts: [],
    };
    server.use(
      http.get(`${FAKE_API_URL}/catalog/option-groups`, () => HttpResponse.json({ data: [group] })),
      http.get(`${FAKE_API_URL}/catalog/products`, () => HttpResponse.json({ data: [product], next_cursor: null })),
    );

    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Bracelet");

    expect(await screen.findByRole("combobox", { name: "Alloy" })).toHaveValue("b");
    expect(screen.queryByRole("radiogroup", { name: "Alloy" })).not.toBeInTheDocument();
  });

  it("offers None only on an optional group with no default", async () => {
    const group = (id: string, count: number): OptionGroup => ({
      id,
      key: id,
      name: id,
      values: Array.from({ length: count }, (_, n) => ({ id: `${id}-${n}`, group_id: id, key: `${id}${n}`, name: `${id} ${n}`, material_id: null })),
    });
    const groups = [group("engraving", 2), group("box", 2), group("wide", 7), group("wide_default", 7)];
    const offered = (id: string) => groups.find((g) => g.id === id)!.values.map((value) => value.id);
    const product: CatalogProduct = {
      id: "product-pendant",
      category_id: "category-pendants",
      key: "pendant",
      name: "Pendant",
      kind: "ready_made",
      status: "active",
      material_id: null,
      sizing: { mode: "none" },
      design_file: null,
      options: [
        { group_id: "engraving", required: false, default_value_id: null, value_ids: offered("engraving") },
        { group_id: "box", required: false, default_value_id: "box-0", value_ids: offered("box") },
        { group_id: "wide", required: false, default_value_id: null, value_ids: offered("wide") },
        { group_id: "wide_default", required: false, default_value_id: "wide_default-1", value_ids: offered("wide_default") },
      ],
      published: true,
      customer_id: null,
      parts: [],
    };
    server.use(
      http.get(`${FAKE_API_URL}/catalog/option-groups`, () => HttpResponse.json({ data: groups })),
      http.get(`${FAKE_API_URL}/catalog/products`, () => HttpResponse.json({ data: [product], next_cursor: null })),
    );

    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Pendant");

    // Radios: no default offers None (and it starts unchosen); a default does not.
    const engraving = await screen.findByRole("radiogroup", { name: "engraving" });
    expect(within(engraving).getByRole("radio", { name: "None" })).toBeChecked();
    expect(within(screen.getByRole("radiogroup", { name: "box" })).queryByRole("radio", { name: "None" })).not.toBeInTheDocument();

    // Selects: the same rule.
    expect(within(screen.getByRole("combobox", { name: "wide" })).getByRole("option", { name: "None" })).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "wide_default" })).queryByRole("option", { name: "None" })).not.toBeInTheDocument();
  });

  it("hides Delivery with one speed", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={MIRA_ID} />);
    await pickProduct("Nameplate");

    // Mira's plan offers only Standard: nothing to choose, but the form holds it.
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent('"speed":"standard"'));
    expect(screen.getByRole("radiogroup", { name: "Material" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Delivery speed" })).not.toBeInTheDocument();
  });

  it("shows the model field only for a custom product", async () => {
    renderAs(STAFF, <Harness customerId={LUNA_ID} />);
    await pickProduct("Nameplate");
    expect(await screen.findByRole("combobox", { name: "Size" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload a model")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Product" }), "Cast ring");
    expect(await screen.findByLabelText("Upload a model")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Drawn in" })).toHaveValue("mm");
  });

  it("says why a quantity can't be used", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Gift set");
    const quantity = await screen.findByRole("textbox", { name: "Quantity" });
    expect(quantity).toHaveValue("1");
    expect(quantity).toHaveAttribute("aria-invalid", "false");

    await userEvent.clear(quantity);
    await userEvent.type(quantity, "0");
    expect(await screen.findByText("Enter a whole number from 1 to 1,000,000.")).toBeInTheDocument();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
  });

  it("marks a refused field and shows its reasons under it", async () => {
    const refusals: Refusals = new Map<RefusedField, readonly string[]>([["size", ["That size is too big for this product."]]]);
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} refusals={refusals} />);
    await pickProduct("Cast ring");

    const size = await screen.findByRole("textbox", { name: "Size" });
    expect(size).toHaveAttribute("aria-invalid", "true");
    expect(size).toHaveAccessibleDescription(/That size is too big for this product\./);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveAttribute("aria-invalid", "false");
  });
});
