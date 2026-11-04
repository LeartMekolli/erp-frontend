import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { FAKE_API_URL } from "./fake-erp-api/seed";
import { resetFakeState } from "./fake-erp-api/state";
import { server } from "./msw";
import { installWebLocks } from "./web-locks";

if (typeof navigator !== "undefined") installWebLocks();

process.env.ERP_API_URL = FAKE_API_URL;
process.env.NEXT_PUBLIC_ERP_API_URL = FAKE_API_URL;
// 32 bytes of 0x01, base64: a fixed key for tests only.
process.env.SESSION_SECRET = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetFakeState();
});

afterAll(() => server.close());
