import { act } from "@testing-library/react";

/**
 * Waiting in tests that fake setInterval to move TanStack Query's polls by hand. Testing Library's
 * `waitFor` re-checks on setInterval, so it would never check again; these wait on real setTimeout.
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Re-checks `check` until it passes, for up to a second. */
export async function until(check: () => void): Promise<void> {
  for (let tries = 0; ; tries += 1) {
    try {
      check();
      return;
    } catch (error) {
      if (tries >= 100) throw error;
      await act(tick);
    }
  }
}

/** Lets any fetch a timer started finish, so a count read afterwards is final. */
export const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));
