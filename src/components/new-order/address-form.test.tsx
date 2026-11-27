import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Address } from "@/lib/api/schema-types";
import { EMPTY_ADDRESS, type AddressField } from "@/lib/new-order/form";

import { AddressForm } from "./address-form";

let latest: Address = EMPTY_ADDRESS;

function Harness({ errors, compact }: { errors?: Partial<Record<AddressField, string>>; compact?: boolean }) {
  const [value, setValue] = useState<Address>(EMPTY_ADDRESS);
  return (
    <AddressForm
      value={value}
      errors={errors}
      compact={compact}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
}

describe("AddressForm", () => {
  it("puts Phone after Name in the compact layout", () => {
    render(<Harness compact />);
    expect(screen.getAllByRole("textbox").map((input) => input.id.replace(/^.*-/, ""))).toEqual([
      "name",
      "phone",
      "line1",
      "line2",
      "city",
      "postal_code",
      "region",
      "country",
    ]);
  });

  it("keeps the default order without compact", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox").map((input) => input.id.replace(/^.*-/, "")).at(1)).toBe("line1");
  });

  it("asks for each field with erp-api's limits", () => {
    render(<Harness />);
    const limits: [string, string][] = [
      ["Name", "200"],
      ["Address line 1", "200"],
      ["Address line 2 (optional)", "200"],
      ["City", "200"],
      ["Postal code", "20"],
      ["Region (optional)", "100"],
      ["Country", "2"],
      ["Phone (optional)", "40"],
    ];
    for (const [label, max] of limits) expect(screen.getByRole("textbox", { name: label })).toHaveAttribute("maxlength", max);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("textbox", { name: "Phone (optional)" })).toHaveAttribute("aria-required", "false");
  });

  it("upper-cases the country as it is typed", async () => {
    render(<Harness />);
    const country = screen.getByRole("textbox", { name: "Country" });
    await userEvent.type(country, "gb");
    expect(country).toHaveValue("GB");
    expect(latest.country).toBe("GB");
    expect(country).toHaveAccessibleDescription("Two letters, such as FR");
  });

  it("says what is wrong under a field once it is left", async () => {
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.click(name);
    expect(name).toHaveAttribute("aria-invalid", "false");
    await userEvent.tab();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Fill this in.");

    // An optional field left blank is fine.
    const line2 = screen.getByRole("textbox", { name: "Address line 2 (optional)" });
    await userEvent.click(line2);
    await userEvent.tab();
    expect(line2).toHaveAttribute("aria-invalid", "false");

    await userEvent.type(name, "Mira Studio");
    expect(name).toHaveAttribute("aria-invalid", "false");
  });

  it("shows erp-api's errors at once", () => {
    render(<Harness errors={{ postal_code: "Not a postal code in GB" }} />);
    const postal = screen.getByRole("textbox", { name: "Postal code" });
    expect(postal).toHaveAttribute("aria-invalid", "true");
    expect(postal).toHaveAccessibleDescription("Not a postal code in GB");
  });
});
