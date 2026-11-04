/** Signed out after 3 hours without activity (the user's choice; NIST suggests 1 hour). */
export const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;

/** Signed out 12 hours after sign-in, however active. */
export const ABSOLUTE_LIMIT_MS = 12 * 60 * 60 * 1000;

export type LimitState = "ok" | "idle" | "expired";

/** Which limit, if any, has passed at `now`. Boundaries count as passed; `expired` wins. */
export function checkLimits(times: { signedInAt: number; lastActiveAt: number }, now: number): LimitState {
  if (now - times.signedInAt >= ABSOLUTE_LIMIT_MS) return "expired";
  if (now - times.lastActiveAt >= IDLE_LIMIT_MS) return "idle";
  return "ok";
}
