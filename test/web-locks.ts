/**
 * An in-memory `navigator.locks` for jsdom, which has none: exclusive locks
 * granted in request order per name. Every session instance in a test shares
 * it, the way tabs of one browser share the real one.
 */
type Callback<T> = (lock: { name: string; mode: "exclusive" }) => Promise<T> | T;

const queues = new Map<string, Promise<unknown>>();

function request<T>(name: string, optionsOrCallback: object | Callback<T>, maybeCallback?: Callback<T>): Promise<T> {
  const callback = (typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback) as Callback<T>;
  const previous = queues.get(name) ?? Promise.resolve();
  const run = previous.then(() => callback({ name, mode: "exclusive" }));
  queues.set(
    name,
    run.catch(() => undefined),
  );
  return run;
}

export function installWebLocks(): void {
  if ("locks" in navigator) return;
  Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
}
