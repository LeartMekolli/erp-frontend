import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CatalogProduct, OptionGroup } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { ProductSection, type RefusedField, type Refusals } from "./product-section";

const NO_REFUSALS: Refusals = new Map();

/** The section inside a form, with what the form holds written out so a test can read it. */
function Harness({ customerId, refusals = NO_REFUSALS }: { customerId: string; refusals?: Refusals }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, customerId } });
  const [productId, options, speed] = useWatch({ control: form.control, name: ["productId", "options", "speed"] });
  return (
    <FormProvider {...form}>
      <ProductSection refusals={refusals} />
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

    // Luna's plan offers two speeds; the default is picked.
    const speed = await screen.findByRole("combobox", { name: "Speed" });
    await waitFor(() => expect(speed).toHaveValue("standard"));
    expect(within(speed).getByRole("option", { name: "Standard · 5 working days" })).toBeInTheDocument();
    expect(within(speed).getByRole("option", { name: "Express · 2 working days" })).toBeInTheDocument();
  });

  it("picks the speed from a select", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Gift set");
    const speed = await screen.findByRole("combobox", { name: "Speed" });
    await waitFor(() => expect(speed).toHaveValue("standard"));
    await userEvent.selectOptions(speed, "Express · 2 working days");
    expect(screen.getByTestId("values")).toHaveTextContent('"speed":"express"');
  });

  it("steps the quantity with the buttons and arrow keys", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Gift set");
    const quantity = await screen.findByRole("textbox", { name: "Quantity" });
    expect(quantity).toHaveValue("1");
    // Screen readers are told about the keys, which sighted users learn from − and +.
    expect(quantity).toHaveAccessibleDescription("The up and down arrow keys change it by one.");

    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(quantity).toHaveValue("2");
    await userEvent.click(quantity);
    await userEvent.keyboard("{ArrowUp}");
    expect(quantity).toHaveValue("3");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    // It stops at 1, by key and by button.
    expect(quantity).toHaveValue("1");
    await userEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(quantity).toHaveValue("1");
    expect(quantity).toHaveAttribute("aria-invalid", "false");
  });

  it("shows the material as tiles", async () => {
    // erp-api's seed keys its material group `material`; the fake's groups are `metal` and `print_material`.
    const values = [
      ["resin", "Standard resin"],
      ["nylon", "Nylon PA12"],
      ["pla", "PLA"],
    ].map(([key, name]) => ({ id: `value-${key}`, group_id: "group-material", key: key!, name: name!, material_id: null }));
    const group: OptionGroup = { id: "group-material", key: "material", name: "Material", values };
    const product: CatalogProduct = {
      id: "product-bracket",
      category_id: "category-printed",
      key: "bracket",
      name: "Bracket",
      kind: "ready_made",
      status: "active",
      material_id: null,
      sizing: { mode: "none" },
      design_file: null,
      options: [{ group_id: group.id, required: true, default_value_id: "value-resin", value_ids: values.map((value) => value.id) }],
      published: true,
      customer_id: null,
      parts: [],
    };
    server.use(
      http.get(`${FAKE_API_URL}/catalog/option-groups`, () => HttpResponse.json({ data: [group] })),
      http.get(`${FAKE_API_URL}/catalog/products`, () => HttpResponse.json({ data: [product], next_cursor: null })),
    );

    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Bracket");

    const material = await screen.findByRole("radiogroup", { name: "Material" });
    expect(material).toHaveClass("sm:grid-cols-3");
    const tiles = within(material).getAllByRole("radio");
    expect(tiles.map((tile) => tile.closest("label")?.textContent)).toEqual(["Standard resin", "Nylon PA12", "PLA"]);
    expect(within(material).getByRole("radio", { name: "Standard resin" })).toBeChecked();

    await userEvent.click(within(material).getByRole("radio", { name: "Nylon PA12" }));
    expect(within(material).getByRole("radio", { name: "Nylon PA12" })).toBeChecked();
    // The checked tile says so by its border too, not by colour alone: the radio dot is there as well.
    expect(within(material).getByRole("radio", { name: "Nylon PA12" }).closest("label")).toHaveClass("border-ink");
    expect(screen.getByTestId("values")).toHaveTextContent('"options":{"material":"nylon"}');
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

  it("hides Speed with one speed", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={MIRA_ID} />);
    await pickProduct("Nameplate");

    // Mira's plan offers only Standard: nothing to choose, but the form holds it.
    await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent('"speed":"standard"'));
    expect(screen.getByRole("radiogroup", { name: "Material" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Speed" })).not.toBeInTheDocument();
  });

  it("moves focus to the product select once it is ready", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    const select = await screen.findByRole("combobox", { name: "Product" });
    await waitFor(() => expect(select).toBeEnabled());
    await waitFor(() => expect(select).toHaveFocus());
  });

  it("asks for a named size with a select", async () => {
    renderAs(ORDER_TAKER, <Harness customerId={LUNA_ID} />);
    await pickProduct("Nameplate");
    expect(await screen.findByRole("combobox", { name: "Size" })).toBeInTheDocument();
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
