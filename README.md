# AMI

AMI is the operations app for made-to-order production: staff, workspace admins and partner workshops run quotes, orders, production and payouts on the same live data. It is a Next.js app on top of erp-api. Customers never sign in here; they use the workspace's own customer site.

## Environment

Put these in `.env.local`:

| Variable | What it is |
|---|---|
| `ERP_API_URL` | erp-api's address, used by AMI's server. Local: `http://localhost:3000` |
| `NEXT_PUBLIC_ERP_API_URL` | The same address, used by the browser |
| `SESSION_SECRET` | Key that seals the session cookie: `openssl rand -base64 32` |

erp-api's `CORS_ORIGINS` must include AMI's origin (`http://localhost:3001` locally).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | AMI on http://localhost:3001 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and component tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) against the fake erp-api |
| `npm run typecheck` | TypeScript, no output |
| `npm run lint` | ESLint |
| `npm run api:types` | Regenerate `src/lib/api/schema.d.ts` from a local erp-api started with `API_DOCS=true` |
| `npm run fake-api` | The fake erp-api on http://localhost:4010 |

## Against a local erp-api

Start erp-api on port 3000 with AMI's origin in `CORS_ORIGINS`, keep both URLs above at `http://localhost:3000` and run `npm run dev`. To run the browser tests against it instead of the fake, set `E2E_API_URL=http://localhost:3000` before `npm run e2e`.
