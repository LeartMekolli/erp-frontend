import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../test/fake-erp-api/state";

import { Freshness } from "./freshness";

const LOADED_AT = Date.parse("2026-11-05T14:05:00Z");

function renderFreshness(query: { dataUpdatedAt: number; isError: boolean }) {
  // Nothing refetches here: the note only reads `/me` for the time zone.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["me"], createFakeState().me(STAFF));
  return render(
    <QueryClientProvider client={client}>
      <Freshness query={query} />
    </QueryClientProvider>,
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOADED_AT);
});
afterEach(() => {
  setOnline(true);
  vi.useRealTimers();
});

describe("Freshness", () => {
  it("says updated just now, then minutes ago", () => {
    renderFreshness({ dataUpdatedAt: LOADED_AT, isError: false });
    expect(screen.getByRole("status")).toHaveTextContent("Updated just now");
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toHaveTextContent("Updated 1 min ago");
    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(screen.getByRole("status")).toHaveTextContent("Updated 5 min ago");
  });

  it("gives the time after an hour", () => {
    renderFreshness({ dataUpdatedAt: LOADED_AT, isError: false });
    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(screen.getByRole("status")).toHaveTextContent("Updated at 14:05");
  });

  it("shows the offline line when the browser goes offline", () => {
    renderFreshness({ dataUpdatedAt: LOADED_AT, isError: false });
    act(() => setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent("You're offline. Showing what was loaded at 14:05.");
  });

  it("says when a refresh failed", () => {
    renderFreshness({ dataUpdatedAt: LOADED_AT, isError: true });
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't refresh. Showing what was loaded at 14:05.");
  });
});
