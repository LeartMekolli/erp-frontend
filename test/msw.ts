import { setupServer } from "msw/node";

import { createHandlers } from "./fake-erp-api/handlers";
import { FAKE_API_URL } from "./fake-erp-api/seed";

/** The fake erp-api in-process for Vitest; tests add one-off handlers with `server.use()`. */
export const server = setupServer(...createHandlers(FAKE_API_URL));
