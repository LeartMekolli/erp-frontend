import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OfflineError,
  SESSION_LOCK,
  SessionEndedError,
  createClientSession,
  type ClientSession,
} from "./client-session";

const MIN = 60 * 1000;
const H = 60 * MIN;

let channelCount = 0;
let channelName: string;
let otherTab: BroadcastChannel;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let session: ClientSession;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function refreshed(accessToken: string, extra: { lastActiveAt?: number; signedInAt?: number } = {}): Response {
  return json(200, {
    accessToken,
    expiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
    signedInAt: extra.signedInAt ?? Date.now(),
    lastActiveAt: extra.lastActiveAt ?? Date.now(),
  });
}

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
}

/** Lets BroadcastChannel messages and queued promises land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  channelName = `ami:test-${channelCount++}`;
  otherTab = new BroadcastChannel(channelName);
  fetchMock = vi.fn<typeof fetch>();
  session = createClientSession({ fetch: fetchMock, channelName });
});

afterEach(() => {
  session.dispose();
  otherTab.close();
  vi.useRealTimers();
});

describe("getAccessToken", () => {
  it("returns the token in memory without a refresh", async () => {
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), signedInAt: Date.now() });
    expect(await session.getAccessToken()).toBe("a1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a token about to expire", async () => {
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 10_000).toISOString(), signedInAt: Date.now() });
    fetchMock.mockResolvedValue(refreshed("a2"));
    expect(await session.getAccessToken()).toBe("a2");
  });

  it("runs one refresh for many concurrent callers", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return refreshed("t1");
    });
    const tokens = await Promise.all(Array.from({ length: 5 }, () => session.getAccessToken()));
    expect(tokens).toEqual(["t1", "t1", "t1", "t1", "t1"]);
    expect(calledPaths()).toEqual(["/session/refresh"]);
  });

  it("uses a token another tab broadcast while waiting for the lock", async () => {
    let release!: () => void;
    void navigator.locks.request(SESSION_LOCK, () => new Promise<void>((resolve) => (release = resolve)));
    const pending = session.getAccessToken();
    otherTab.postMessage({
      type: "token",
      accessToken: "from-tab-2",
      expiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
      signedInAt: Date.now(),
    });
    await settle();
    release();
    expect(await pending).toBe("from-tab-2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares its new token with the other tabs", async () => {
    const received = new Promise<MessageEvent>((resolve) => (otherTab.onmessage = resolve));
    fetchMock.mockResolvedValue(refreshed("t1"));
    await session.getAccessToken();
    expect((await received).data).toMatchObject({ type: "token", accessToken: "t1" });
  });

  it("sends the last activity with the refresh", async () => {
    session.recordActivity();
    // Read before the refresh: adopting its answer can move lastActivity() on by a millisecond.
    const activeAt = session.lastActivity();
    fetchMock.mockResolvedValue(refreshed("t1"));
    await session.getAccessToken();
    const init = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(String(init.body))).toEqual({ activeAt });
  });

  it("does not sign out when offline", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(OfflineError);
    expect(ended).not.toHaveBeenCalled();
  });

  it("does not sign out when erp-api is unreachable", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    fetchMock.mockResolvedValue(json(502, { error: "api_unreachable" }));
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(OfflineError);
    expect(ended).not.toHaveBeenCalled();
  });

  it("ends the session when the server says it was revoked", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    fetchMock.mockResolvedValue(json(401, { reason: "revoked" }));
    await expect(session.getAccessToken()).rejects.toMatchObject({ reason: "revoked" });
    expect(ended).toHaveBeenCalledWith("revoked");
  });

  it("reports no session without announcing a sign-out", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    fetchMock.mockResolvedValue(json(401, { reason: "none" }));
    const error = await session.getAccessToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionEndedError);
    expect((error as SessionEndedError).reason).toBe("none");
    expect(ended).not.toHaveBeenCalled();
  });

  it("adopts the activity time the server remembers", async () => {
    const earlier = Date.now() + 5 * MIN;
    fetchMock.mockResolvedValue(refreshed("t1", { lastActiveAt: earlier }));
    await session.getAccessToken();
    expect(session.lastActivity()).toBe(earlier);
  });
});

describe("signOut", () => {
  it("logs out on the server with the token and tells the other tabs", async () => {
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), signedInAt: Date.now() });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await settle(); // let startSession's own token message pass first
    const received = new Promise<MessageEvent>((resolve) => (otherTab.onmessage = resolve));
    await session.signOut();
    expect(calledPaths()).toEqual(["/session/logout"]);
    expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get("authorization")).toBe("Bearer a1");
    expect((await received).data).toEqual({ type: "signed-out", reason: "signed-out" });
  });

  it("can sign out without calling this tab's listeners, while still telling the other tabs", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), signedInAt: Date.now() });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await settle();
    const received = new Promise<MessageEvent>((resolve) => (otherTab.onmessage = resolve));
    await session.signOut("signed-out", { quiet: true });
    expect(ended).not.toHaveBeenCalled();
    expect((await received).data).toEqual({ type: "signed-out", reason: "signed-out" });
    expect(calledPaths()).toEqual(["/session/logout"]);
  });

  it("signs this tab out when another tab signs out", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), signedInAt: Date.now() });
    otherTab.postMessage({ type: "signed-out", reason: "signed-out" });
    await settle();
    expect(ended).toHaveBeenCalledWith("signed-out");
    fetchMock.mockResolvedValue(json(401, { reason: "none" }));
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe("limits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: 0 });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  function start() {
    session.startSession({ accessToken: "a1", expiresAt: new Date(15 * MIN).toISOString(), signedInAt: 0 });
    session.watch();
  }

  it("signs out after 3 hours with nobody touching the page", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    await vi.advanceTimersByTimeAsync(3 * H - 1);
    expect(ended).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toHaveBeenCalledWith("idle");
    expect(calledPaths()).toEqual(["/session/logout"]);
  });

  it("signs out exactly 12 hours after sign-in, however active", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    for (let hour = 1; hour < 12; hour++) {
      await vi.advanceTimersByTimeAsync(H);
      session.recordActivity();
    }
    expect(ended).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(H);
    expect(ended).toHaveBeenCalledWith("expired");
  });

  it("signs out on wake when the idle limit passed during sleep", () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    vi.setSystemTime(3 * H + MIN); // the laptop slept: no timer ran
    window.dispatchEvent(new Event("focus"));
    expect(ended).toHaveBeenCalledWith("idle");
  });

  it("signs out as idle, without refreshing, when a token is asked for past the idle limit", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    vi.setSystemTime(3 * H + MIN); // a background refetch ran before the idle timer did
    await expect(session.getAccessToken()).rejects.toMatchObject({ reason: "idle" });
    expect(ended.mock.calls).toEqual([["idle"]]);
    expect(calledPaths()).toEqual(["/session/logout"]);
  });

  it("does not refresh for later callers once the session ended in this tab", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    vi.setSystemTime(3 * H + MIN); // several background refetches are due at once
    await expect(session.getAccessToken()).rejects.toMatchObject({ reason: "idle" });
    fetchMock.mockResolvedValue(json(401, { reason: "revoked" }));
    await expect(session.getAccessToken()).rejects.toMatchObject({ reason: "idle" });
    expect(ended.mock.calls).toEqual([["idle"]]);
    expect(calledPaths()).toEqual(["/session/logout"]);
  });

  it("keeps the sign-out reason when a refresh answers after the session ended", async () => {
    const ended = vi.fn();
    session.onSessionEnded(ended);
    start();
    vi.setSystemTime(20 * MIN); // the access token has run out
    let answer!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const pending = session.getAccessToken();
    await vi.waitFor(() => expect(calledPaths()).toEqual(["/session/refresh"]));

    void session.signOut("idle");
    answer(json(401, { reason: "revoked" }));
    await expect(pending).rejects.toMatchObject({ reason: "idle" });
    expect(ended.mock.calls).toEqual([["idle"]]);
  });

  it("does not bring back a session that ended while its refresh was out", async () => {
    start();
    vi.setSystemTime(20 * MIN);
    let answer!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const pending = session.getAccessToken();
    await vi.waitFor(() => expect(calledPaths()).toEqual(["/session/refresh"]));

    void session.signOut();
    answer(refreshed("a2"));
    await expect(pending).rejects.toBeInstanceOf(SessionEndedError);
    fetchMock.mockResolvedValue(json(401, { reason: "none" }));
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });

  it("does not count background refreshes as activity", async () => {
    start();
    await vi.advanceTimersByTimeAsync(H);
    fetchMock.mockResolvedValue(refreshed("a2", { lastActiveAt: 0, signedInAt: 0 }));
    await session.getAccessToken({ force: true });
    expect(session.lastActivity()).toBe(0);
  });

  it("does not sign itself out when it learns of the session from another tab", async () => {
    vi.useRealTimers();
    const ended = vi.fn();
    session.onSessionEnded(ended);
    otherTab.postMessage({
      type: "token",
      accessToken: "from-tab-2",
      expiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
      signedInAt: Date.now() - H,
      lastActiveAt: Date.now() - MIN,
    });
    await settle();
    expect(ended).not.toHaveBeenCalled();
    expect(session.lastActivity()).toBeGreaterThanOrEqual(Date.now() - MIN - 100);
  });

  it("takes another tab's activity", async () => {
    vi.useRealTimers();
    session.startSession({ accessToken: "a1", expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), signedInAt: Date.now() });
    const at = Date.now() + MIN;
    otherTab.postMessage({ type: "activity", at });
    await settle();
    expect(session.lastActivity()).toBe(at);
  });
});
