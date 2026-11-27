import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { getResponse } from "msw";

import { APP_URL } from "../../e2e/urls";
import type { InvitationEmailStatus, PayoutAccountState } from "../../src/lib/api/schema-types";

import { createHandlers } from "./handlers";
import { fakeState, resetFakeState } from "./state";

/**
 * The fake erp-api over HTTP, for Playwright: AMI's server and the browser
 * both call it, like the real one. Run with `npm run fake-api`.
 *
 * Test-only routes:
 * - `POST /__reset` starts the fake's data over.
 * - `POST /__fail-next-label/<orderId>` makes the courier service refuse
 *   that order's next label with a 503.
 * - `POST /__suspend-partner/<partnerId>` suspends that workshop: its
 *   `/partner-portal/me` status says so and its accept and decline answer 403.
 * - `POST /__setting-up/<partnerId>` puts that workshop back to being set up,
 *   not yet submitted or approved.
 * - `POST /__require-skill/<stepKey>` makes that step need a skill nobody
 *   signed in holds, so its pieces can't be worked.
 * - `POST /__settle-payout/<partnerId>/<paid|failed>` has the payment provider
 *   settle that workshop's pending payout; a failed one gives its jobs back.
 * - `POST /__payout-account/<partnerId>/<state>` sets that workshop's payout
 *   account (`not_connected`, `onboarding`, `ready` or `restricted`).
 * - `POST /__invitation-email/<status>` sets what becomes of the next
 *   invitation emails (`queued`, `no_customer_site` or `failed`).
 * - `POST /__expire-quotes` runs out the hold of every saved quote: placing
 *   one next answers 409 `price_changed` with a new quote at the total × 1.1.
 * - `GET /fake-provider/onboarding?partner=<partnerId>` stands in for the
 *   payment provider's setup page: the payout account turns ready and the
 *   browser goes back to AMI's `/payout-account?onboarding=done`.
 * - `GET /__link?to=<url>` is a page with one link, so a test can follow a
 *   link into AMI from another site.
 * - `PUT /__storage/uploads/<fileId>/<versionId>` stands in for the bucket a
 *   signed upload link points at (in `handlers.ts`).
 */
const port = Number(process.env.FAKE_API_PORT ?? 4010);
const handlers = createHandlers("");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
  return new Request(url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  // The server answers CORS itself; a handler's own CORS headers (fake storage's) would repeat them.
  response.headers.forEach((value, name) => {
    if (!name.startsWith("access-control-")) res.appendHeader(name, value);
  });
  res.writeHead(response.status);
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // erp-api lists AMI's origin in CORS_ORIGINS; the fake allows any origin.
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type, idempotency-key");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE");
  res.setHeader("vary", "origin");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    resetFakeState();
    res.writeHead(204).end();
    return;
  }

  const suspend = /^\/__suspend-partner\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && suspend) {
    fakeState().suspendPartner(decodeURIComponent(suspend[1]!));
    res.writeHead(204).end();
    return;
  }

  const settingUp = /^\/__setting-up\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && settingUp) {
    fakeState().setPartnerSettingUp(decodeURIComponent(settingUp[1]!));
    res.writeHead(204).end();
    return;
  }

  const skill = /^\/__require-skill\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && skill) {
    fakeState().production.requireSkill(decodeURIComponent(skill[1]!));
    res.writeHead(204).end();
    return;
  }

  const settle = /^\/__settle-payout\/([^/]+)\/(paid|failed)$/.exec(url.pathname);
  if (req.method === "POST" && settle) {
    fakeState().earnings.settlePending(decodeURIComponent(settle[1]!), settle[2] as "paid" | "failed");
    res.writeHead(204).end();
    return;
  }

  const account = /^\/__payout-account\/([^/]+)\/(not_connected|onboarding|ready|restricted)$/.exec(url.pathname);
  if (req.method === "POST" && account) {
    fakeState().earnings.setAccount(decodeURIComponent(account[1]!), account[2] as PayoutAccountState);
    res.writeHead(204).end();
    return;
  }

  const invitationEmail = /^\/__invitation-email\/(queued|no_customer_site|failed)$/.exec(url.pathname);
  if (req.method === "POST" && invitationEmail) {
    fakeState().catalog.setInvitationEmail(invitationEmail[1] as InvitationEmailStatus);
    res.writeHead(204).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/__expire-quotes") {
    fakeState().quotes.expireQuotes();
    res.writeHead(204).end();
    return;
  }

  const failLabel = /^\/__fail-next-label\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && failLabel) {
    fakeState().orders.failNextLabel(decodeURIComponent(failLabel[1]!));
    res.writeHead(204).end();
    return;
  }

  // The payment provider's onboarding, finished at once: the account turns ready, as its webhook would
  // say, and the owner goes back to AMI the way erp-api's return link sends them.
  if (req.method === "GET" && url.pathname === "/fake-provider/onboarding") {
    const partnerId = url.searchParams.get("partner") ?? "";
    fakeState().earnings.setAccount(partnerId, "ready");
    res.writeHead(302, { location: `${APP_URL}/partner-portal/${encodeURIComponent(partnerId)}/payout-account?onboarding=done` }).end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/__link") {
    const to = escapeHtml(url.searchParams.get("to") ?? "/");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Link</title><a href="${to}">Open AMI</a>`);
    return;
  }

  try {
    const response = await getResponse(handlers, await toRequest(req, url), { baseUrl: url.origin });
    if (response) await send(res, response);
    else res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Not in the fake" }));
  } catch (error) {
    console.error(error);
    res.writeHead(500).end();
  }
}).listen(port, () => {
  console.log(`Fake erp-api on http://localhost:${port}`);
});
