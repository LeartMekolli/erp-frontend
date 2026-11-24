import { describe, expect, it } from "vitest";

import { FAKE_API_URL, FAKE_PASSWORD, LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, WORKSPACE, type FakeUser } from "./seed";
import { fakeState } from "./state";

const RANGE = "from=2026-10-26&to=2026-11-24";

async function tokenFor(user: FakeUser): Promise<string> {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: user.email, password: FAKE_PASSWORD }),
  });
  return ((await login.json()) as { access_token: string }).access_token;
}

async function get(user: FakeUser, path: string, partnerId = NORTHCAST_ID) {
  const token = await tokenFor(user);
  return fetch(`${FAKE_API_URL}/partner-portal/partners/${partnerId}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

describe("fake erp-api partner dashboard", () => {
  it("leaves the money out of a member's summary", async () => {
    const res = await get(NORTHCAST_MEMBER, `/summary?${RANGE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ jobs_finished: 14, previous_jobs_finished: 11 });
    expect(body.steps).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Casting" })]));
    for (const key of ["earned", "previous_earned", "currency", "series"]) expect(body).not.toHaveProperty(key);
  });

  it("gives an admin the money as strings", async () => {
    const body = (await (await get(NORTHCAST_ADMIN, `/summary?${RANGE}`)).json()) as Record<string, unknown>;
    expect(body.earned).toMatch(/^\d+\.\d{2}$/);
    expect(body.previous_earned).toMatch(/^\d+\.\d{2}$/);
    expect(body.currency).toBe("EUR");
    expect(body.range).toEqual({ from: "2026-10-26", to: "2026-11-24", previous_from: "2026-09-26", previous_to: "2026-10-25", bucket: "day" });
  });

  it("refuses a range that ends before it starts", async () => {
    const res = await get(NORTHCAST_MEMBER, "/summary?from=2026-11-24&to=2026-11-01");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ errors: [{ path: "to" }] });
  });

  it("counts the workshop's jobs as the list shows them", async () => {
    const res = await get(NORTHCAST_MEMBER, "/jobs/counts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ offered: 2, accepted: 2, finished: 1, late: 0, due_soon: 1 });
  });

  it("scores Northcast, and has no score yet for Layerline", async () => {
    const northcast = (await (await get(NORTHCAST_MEMBER, "/score")).json()) as { score: { overall: number | null; parts: Record<string, number | null> }; ratings: { comment: string | null }[] };
    expect(northcast.score.overall).toBe(4.4);
    const parts = Object.entries(northcast.score.parts) as [string, number][];
    expect(parts.toSorted((a, b) => a[1] - b[1])[0]![0]).toBe("on_time");
    expect(northcast.ratings).toHaveLength(50);
    expect(northcast.ratings.filter((rating) => rating.comment !== null)).toHaveLength(1);

    const layerline = (await (await get(LAYERLINE_OWNER, "/score", LAYERLINE_ID)).json()) as { score: { overall: number | null; finished_jobs: number } };
    expect(layerline.score).toMatchObject({ overall: null, finished_jobs: 2 });
  });

  it("gives Layerline capabilities but no offerings", async () => {
    const northcast = (await (await get(NORTHCAST_MEMBER, "/setup")).json()) as { capabilities: unknown[]; offerings: unknown[] };
    expect(northcast.capabilities.length).toBeGreaterThan(0);
    expect(northcast.offerings.length).toBeGreaterThan(0);
    const layerline = (await (await get(LAYERLINE_OWNER, "/setup", LAYERLINE_ID)).json()) as { capabilities: unknown[]; offerings: unknown[] };
    expect(layerline.capabilities.length).toBeGreaterThan(0);
    expect(layerline.offerings).toEqual([]);
  });

  it("keeps a row per day and step, oldest day first", async () => {
    const body = (await (await get(NORTHCAST_MEMBER, "/capacity-history?from=2026-11-01&to=2026-11-03")).json()) as {
      data: { date: string; step_type: { key: string }; capacity: number; capacity_period: string }[];
    };
    const days = body.data.map((row) => row.date);
    expect(days).toEqual(days.toSorted());
    expect(new Set(days)).toEqual(new Set(["2026-11-01", "2026-11-02", "2026-11-03"]));
    expect(body.data.filter((row) => row.date === "2026-11-01").map((row) => row.step_type.key)).toEqual(["print_pattern", "casting_tree", "casting", "polishing", "plating"]);
    expect(body.data.some((row) => row.capacity_period === "week")).toBe(true);
  });

  it("raises Casting's capacity from 45 to 50 a day", async () => {
    const body = (await (await get(NORTHCAST_MEMBER, `/capacity-history?${RANGE}`)).json()) as { data: { step_type: { key: string }; capacity: number; load: number }[] };
    const casting = body.data.filter((row) => row.step_type.key === "casting");
    expect(casting).toHaveLength(30);
    expect(casting[0]!.capacity).toBe(45);
    expect(casting.at(-1)!.capacity).toBe(50);
    expect(casting.some((row) => row.load > row.capacity)).toBe(true);
  });

  it("has no capacity history for a workshop that can't do any step", async () => {
    fakeState().partnerDashboard.clearCapabilities(LAYERLINE_ID);
    const res = await get(LAYERLINE_OWNER, `/capacity-history?${RANGE}`, LAYERLINE_ID);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("lets anyone acting for the workshop read it, and nobody else", async () => {
    for (const path of [`/summary?${RANGE}`, "/jobs/counts", "/score", "/setup", "/capacity-history"]) {
      expect((await get(NORTHCAST_MEMBER, path)).status).toBe(200);
      expect((await get(PARTNER, path)).status).toBe(200);
      expect((await get(LAYERLINE_OWNER, path)).status).toBe(404);
    }
  });
});
