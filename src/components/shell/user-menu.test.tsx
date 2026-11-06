import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { clientSession } from "@/lib/session/client-session";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { UserMenu } from "./user-menu";

describe("UserMenu", () => {
  it("opens with the name, email and roles", async () => {
    renderAs(STAFF, <UserMenu />);
    await userEvent.click(await screen.findByRole("button", { name: "Account: Dana" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Dana");
    expect(menu).toHaveTextContent(STAFF.email);
    expect(menu).toHaveTextContent("Owner");
  });

  it("signs out from the menu", async () => {
    const signOut = vi.spyOn(clientSession(), "signOut").mockResolvedValue(undefined);
    renderAs(STAFF, <UserMenu />);
    await userEvent.click(await screen.findByRole("button", { name: "Account: Dana" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("works from the keyboard", async () => {
    const signOut = vi.spyOn(clientSession(), "signOut").mockResolvedValue(undefined);
    renderAs(STAFF, <UserMenu />);
    const trigger = await screen.findByRole("button", { name: "Account: Dana" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
