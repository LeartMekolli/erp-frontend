import { createApiClient } from "../src/lib/api/client";
import type { PartnerPaths } from "../src/lib/api/schema-types";

import { FAKE_API_URL, FAKE_PASSWORD, WORKSPACE, type FakeUser } from "./fake-erp-api/seed";
import { fakeState } from "./fake-erp-api/state";

/** The app's two clients, signed in to the fake erp-api as `user`, without AMI's session server. */
export function signedInClients(user: FakeUser) {
  const tokens = fakeState().login(WORKSPACE, user.email, FAKE_PASSWORD);
  if ("status" in tokens) throw new Error(`fake login failed for ${user.email}`);
  const session = { getAccessToken: async () => tokens.access_token };
  return {
    api: createApiClient(session, FAKE_API_URL),
    partnerApi: createApiClient<PartnerPaths>(session, FAKE_API_URL),
  };
}
