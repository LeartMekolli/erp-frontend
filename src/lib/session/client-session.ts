import { ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS, checkLimits } from "./limits";

export type SignOutReason = "signed-out" | "idle" | "expired" | "revoked";
/** Why there's no session: a sign-out, or `none` when there never was one. */
export type EndReason = SignOutReason | "none";

export class SessionEndedError extends Error {
  constructor(readonly reason: EndReason) {
    super(`Session ended: ${reason}`);
    this.name = "SessionEndedError";
  }
}

/** AMI's server or erp-api couldn't be reached. Never a sign-out: retry when back online. */
export class OfflineError extends Error {
  constructor() {
    super("Offline");
    this.name = "OfflineError";
  }
}

/** One refresh at a time across every tab of the browser. */
export const SESSION_LOCK = "ami:session-refresh";
/** Tabs share new tokens, sign-outs and activity on this channel. */
export const SESSION_CHANNEL = "ami:session";

/** A token with less than this left is refreshed before use. */
const REFRESH_EARLY_MS = 30_000;
/** Activity is shared with other tabs at most this often. */
const ACTIVITY_SHARE_MS = 60_000;
const END_REASONS: readonly EndReason[] = ["signed-out", "idle", "expired", "revoked", "none"];

type Message =
  | { type: "token"; accessToken: string; expiresAt: string; signedInAt: number; lastActiveAt: number }
  | { type: "signed-out"; reason: SignOutReason }
  | { type: "activity"; at: number };

export interface StartedSession {
  accessToken: string;
  expiresAt: string;
  signedInAt: number;
}

export interface ClientSession {
  /** After sign-in: keeps the access token in memory and tells the other tabs. */
  startSession(started: StartedSession): void;
  /** A valid access token, refreshing (once, across tabs) when needed. */
  getAccessToken(options?: { force?: boolean }): Promise<string>;
  signOut(reason?: SignOutReason): Promise<void>;
  onSessionEnded(listener: (reason: SignOutReason) => void): () => void;
  /** The person did something: pointer, keys or navigation. Never background work. */
  recordActivity(): void;
  lastActivity(): number;
  /** Listens for activity and for waking up (focus, visible, online). Returns a stop function. */
  watch(): () => void;
  dispose(): void;
}

/**
 * The browser side of the session. The access token lives only here, in
 * memory; the refresh token stays in AMI's `HttpOnly` cookie.
 */
export function createClientSession({
  fetch: send = (...args) => fetch(...args),
  channelName = SESSION_CHANNEL,
}: { fetch?: typeof fetch; channelName?: string } = {}): ClientSession {
  let token: { accessToken: string; expiresAt: number; signedInAt: number } | null = null;
  let activity = 0;
  let activityShared = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let localLock: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(reason: SignOutReason) => void>();
  const stops = new Set<() => void>();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);

  const post = (message: Message) => channel?.postMessage(message);
  const url = (path: string) => new URL(path, window.location.origin).toString();

  async function withLock<T>(task: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(SESSION_LOCK, task);
    // No Web Locks: still one refresh at a time within this tab.
    const run = localLock.then(task);
    localLock = run.catch(() => undefined);
    return run;
  }

  function freshToken(): string | null {
    return token && token.expiresAt - Date.now() > REFRESH_EARLY_MS ? token.accessToken : null;
  }

  function schedule(): void {
    clearTimeout(timer);
    if (!token) return;
    const deadline = Math.min(token.signedInAt + ABSOLUTE_LIMIT_MS, activity + IDLE_LIMIT_MS);
    timer = setTimeout(check, Math.max(0, deadline - Date.now()));
  }

  function check(): void {
    if (!token) return;
    const state = checkLimits({ signedInAt: token.signedInAt, lastActiveAt: activity }, Date.now());
    if (state === "ok") schedule();
    else void signOut(state);
  }

  function end(reason: EndReason, announce: boolean): void {
    token = null;
    clearTimeout(timer);
    if (reason === "none") return;
    if (announce) post({ type: "signed-out", reason });
    for (const listener of listeners) listener(reason);
  }

  function adopt(next: { accessToken: string; expiresAt: string; signedInAt: number; lastActiveAt?: number }): void {
    token = { accessToken: next.accessToken, expiresAt: Date.parse(next.expiresAt), signedInAt: next.signedInAt };
    // Signing in is activity: a tab that has seen none yet must not judge itself idle from 0.
    activity = Math.max(activity, next.signedInAt, next.lastActiveAt ?? 0);
    schedule();
  }

  async function refresh(): Promise<string> {
    let response: Response;
    try {
      response = await send(url("/session/refresh"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeAt: activity }),
      });
    } catch {
      throw new OfflineError();
    }

    if (response.status === 401) {
      const body = (await response.json().catch(() => ({}))) as { reason?: EndReason };
      const reason = body.reason && END_REASONS.includes(body.reason) ? body.reason : "revoked";
      end(reason, true);
      throw new SessionEndedError(reason);
    }
    if (!response.ok) throw new OfflineError();

    const body = (await response.json()) as StartedSession & { lastActiveAt: number };
    adopt(body);
    post({
      type: "token",
      accessToken: body.accessToken,
      expiresAt: body.expiresAt,
      signedInAt: body.signedInAt,
      lastActiveAt: activity,
    });
    return body.accessToken;
  }

  async function signOut(reason: SignOutReason = "signed-out"): Promise<void> {
    const accessToken = token?.accessToken;
    end(reason, true);
    try {
      await send(url("/session/logout"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: "{}",
        keepalive: true,
      });
    } catch {
      // Offline: the server ends the session at its limits anyway.
    }
  }

  function recordActivity(): void {
    const now = Date.now();
    activity = Math.max(activity, now);
    if (now - activityShared >= ACTIVITY_SHARE_MS) {
      activityShared = now;
      post({ type: "activity", at: now });
    }
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (message.type === "token") adopt(message);
      else if (message.type === "signed-out") end(message.reason, false);
      else if (message.type === "activity") activity = Math.max(activity, message.at);
    };
  }

  return {
    startSession(started) {
      activity = Math.max(activity, Date.now());
      adopt(started);
      post({ type: "token", ...started, lastActiveAt: activity });
    },

    async getAccessToken({ force = false } = {}) {
      if (!force) {
        const current = freshToken();
        if (current) return current;
      }
      const seen = token?.accessToken;
      return withLock(async () => {
        // Another caller or tab may have refreshed while this one waited.
        const current = freshToken();
        if (current && (!force || current !== seen)) return current;
        return refresh();
      });
    },

    signOut,

    onSessionEnded(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    recordActivity,

    lastActivity: () => activity,

    watch() {
      const onVisible = () => {
        if (document.visibilityState === "visible") check();
      };
      const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", onVisible);
      for (const name of activityEvents) window.addEventListener(name, recordActivity, { passive: true });

      const stop = () => {
        window.removeEventListener("focus", check);
        window.removeEventListener("online", check);
        document.removeEventListener("visibilitychange", onVisible);
        for (const name of activityEvents) window.removeEventListener(name, recordActivity);
        stops.delete(stop);
      };
      stops.add(stop);
      return stop;
    },

    dispose() {
      for (const stop of [...stops]) stop();
      clearTimeout(timer);
      channel?.close();
      listeners.clear();
    },
  };
}

let instance: ClientSession | null = null;

/** This tab's session. */
export function clientSession(): ClientSession {
  instance ??= createClientSession();
  return instance;
}
