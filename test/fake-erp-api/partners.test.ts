import { describe, expect, it } from "vitest";

import { CLERK, FAKE_API_URL, FAKE_PASSWORD, LAYERLINE_ID, NORTHCAST_ID, STAFF, WORKSPACE, type FakeUser } from "./seed";

async function get(user: FakeUser, path: string) {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: user.email, password: FAKE_PASSWORD }),
  });
  const { access_token } = (await login.json()) as { access_token: string };
  return fetch(`${FAKE_API_URL}${path}`, { headers: { authorization: `Bearer ${access_token}` } });
}

describe("fake erp-api staff partners", () => {
  it("lists partners to staff with partner.read", async () => {
    const res = await get(STAFF, "/partners");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; display_name: string; status: string; payout_account: string }[]; next_cursor: string | null };
    expect(body.data.map((partner) => partner.id)).toEqual([NORTHCAST_ID, LAYERLINE_ID]);
    expect(body.data[0]).toMatchObject({ display_name: "Northcast Foundry", status: "approved", payout_account: "not_connected" });
    expect(body.data[1]).toMatchObject({ display_name: "Layerline Prints", payout_account: "ready" });
    expect(body.next_cursor).toBeNull();

    expect((await get(CLERK, "/partners")).status).toBe(403);
    expect((await get(CLERK, `/partners/${NORTHCAST_ID}`)).status).toBe(403);
  });

  it("answers 404 for a partner that isn't there", async () => {
    const res = await get(STAFF, "/partners/9a9a9a9a-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ detail: "Partner not found" });
  });
});
