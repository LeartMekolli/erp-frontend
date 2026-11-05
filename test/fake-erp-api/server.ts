import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { getResponse } from "msw";

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

  const failLabel = /^\/__fail-next-label\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && failLabel) {
    fakeState().orders.failNextLabel(decodeURIComponent(failLabel[1]!));
    res.writeHead(204).end();
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
