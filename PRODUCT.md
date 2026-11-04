# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

AMI has two audiences, and both matter.

**People evaluating the project.** AMI is a portfolio project, so the first real users are:
- a hiring manager clicking through the hosted live demo for a few minutes, who should be able to follow a whole order from start to finish;
- an engineer reading the code for longer, who judges the architecture, the typed API client, the tests, and how the hard parts are handled.

**People inside the product.** AMI is for the company that handles the orders, and the workshops and operator around it. It has three areas:
- **Staff** at a 3D printing and casting service. They work in it all day: catalog and pricing, customers, quotes and orders, moving pieces through workflow steps and QC, sending jobs to partners, claims, payments, reports, settings and roles. What each person can see and do depends on about 45 permissions.
- **Partners**, meaning outside workshops that take jobs (in the seed: Northcast Foundry for cast metal, Layerline Prints for printed parts). They accept or decline offers, move pieces through their steps behind the same QC gate as staff, set up their capabilities and prices, and get paid. They never see the customer or the customer's price.
- **Platform admins**, who run AMI itself: they create and suspend workspaces, set each workspace's monthly AI limit, and watch and retry failed background jobs.

**Customers are not AMI users, and never will be.** AMI is only for the company's own processes and operations, including managing its customers. Customers reach the backend only through the workspace's own storefront: a separate customer site that each workspace sets with `PUT /workspace/customer-site` and that calls the `/portal/customers/...` routes. AMI doesn't build that site. Because `POST /auth/login` also accepts customer accounts, AMI turns them away after login (see `CLAUDE.md`).

## Product Purpose

AMI is the frontend for erp-api: an ERP for made-to-order production, covering configurable products, step-based pricing, routing work to production partners, and a configurable workflow with quality control. The demo presents it as a 3D printing and casting service.

Success means both audiences come away impressed:
- the demo tells one complete story across staff and partners: an order is quoted and placed, staff send the job to a partner, pieces move through the steps and QC, the order ships, and the partner gets paid;
- the code holds up under a careful review.

Build order (confirmed):
1. the foundation, done properly;
2. that one story across the staff and partner areas;
3. every remaining screen, area by area, to the same standard.

The goal is to cover the whole API eventually, except the customer site. The work is open-ended, but finishing sooner is better.

## Positioning

- **Serial tracking.** Every piece has its own work order (a line of 10 is pieces 1/10 to 10/10), and every move is recorded and never edited.
- **Partners are part of the system.** Offers go to outside workshops at a frozen cost, chosen by capability and capacity, and the deadline is enforced by the server.
- **Prices come from measuring the uploaded model.** The server measures the file (volume, surface area and so on) and prices each step from those measures and from material prices, some of which follow live metal prices.
- **The company and its workshops work from the same live data.** An order that staff take in appears in the partner's jobs, and every piece the partner moves shows up straight away in the staff view.

## Operating Context

The demo workspace is a 3D printing and casting service with three product categories:
- **Printed parts.** Standard resin, Nylon PA12 or PLA. Steps: print, cure, finish, packing.
- **Cast metal parts.** Silver 925, Gold 18k or Brass. Steps: print pattern, casting tree, casting, polishing, plating, Final QC, packing.
- **Assemblies.** Assembly, then packing.

QC checklists and defects come from the seed: porosity, scratch, crack, surface smooth or pitted, and whether the dimensions match the order.

Staff work from queues and lists, and often move several pieces at once. Partners work through their offers and accepted jobs. Emails link into AMI at `/accept-invitation#token=`, `/reset-password#token=`, `/orders/:id`, `/billing` and `/partner-portal/:partnerId/...`; customer emails go to the customer site instead.

### Areas and sections

**Staff**

| Section | Contents |
|---|---|
| Dashboard | Revenue, workload, the daily AI briefing |
| Orders & quotes | Quotes, orders, comments, shipping |
| Production | Work orders, moves through steps, QC checklists, defects, planning |
| Partners | Workshops, offers, ratings, prices, capabilities, payouts |
| Customers | Accounts, groups, priority bands, plans, credits |
| Catalog | Products, option groups, materials and metal prices, units |
| Pricing | Step types, step prices, price chains, adjustments |
| Claims | Complaints and refunds |
| Payments | Ledger, payment terms, refunds, credit packs and campaigns |
| Reports | CSV and PDF exports |
| AI | ⌘K search, questions, job summaries, knowledge articles |
| Settings | Workspace, users and invitations, roles, staff skills, email templates, couriers, customer site |
| Notifications | The feed |

**Partner portal**

| Section | Contents |
|---|---|
| Dashboard | Offers waiting and time left, jobs in progress, owed now, latest payouts, score, setup still to finish, recent activity. Built from existing partner routes; there's no dashboard endpoint |
| Jobs | Offers to accept or decline, accepted jobs |
| Job detail | Design file, moving pieces behind the QC gate, QC photos, comments with staff |
| Setup | Capabilities, closed days, offered option values, limits, submitting for approval |
| Prices | Their own price list, which can start from the workspace's prices |
| Earnings | Owed per job, payouts, payout account onboarding |
| Performance | Score and ratings |
| Team | Inviting and removing colleagues |
| Notifications | The feed |

**Platform admin** (its own entry point and login)

| Section | Contents |
|---|---|
| Workspaces | List, create (emails an invitation to the owner), suspend, AI limit and spend this month |
| Background jobs | Counts for each queue, failed jobs, retry |
| Diagnostics | A test error, to check that errors reach the logs |

### First story scope

- **Staff:** Orders & quotes, Production, Partners, Notifications.
- **Partner portal:** Dashboard, Jobs, Job detail, Notifications, then Earnings.
- **Platform admin:** after the story. The seed already creates the admin account and the workspaces. The failed jobs view may come early if background jobs need debugging during the story.

## Capabilities and Constraints

**Stack.** Already in the repo: Next.js 16.4 (App Router), React 19.3 with the React Compiler, TypeScript and Tailwind 4.

**Chosen together (2026-11-04):**
- **Components:** shadcn/ui (Radix primitives), fully restyled to AMI's own look.
- **API client:** openapi-typescript and openapi-fetch, typed from `/docs/openapi.json`, with hand-written TanStack Query hooks.
- **Server data, caching and refresh:** TanStack Query. Apollo was considered and rejected, because it's built for GraphQL and erp-api is REST.
- **Forms:** React Hook Form.
- **Validation:** Zod.
- **Tests:**
  - Vitest and Testing Library for units and components;
  - MSW for a fake API in tests and demos;
  - Playwright for browser tests at every screen size.

**Sign-in and the workspace (decided 2026-11-04):**
- The login form has a **workspace field**, empty by default, that the user fills in (for example `demo`). It's sent as `workspace` on login. No subdomains for now, so the demo runs on any free URL.
- Picking the workspace lives in one place in the code, so subdomain detection can be added later without touching the screens.
- **One-click demo buttons** ("Try as Staff", "Try as Partner", "Try as Platform admin") come later, added by you.

**Still to design:** the rest of session handling (token storage, single-flight refresh, sign-out).

**The API decides these, and the frontend must follow them.**
- **Login.** A 15-minute access token, plus a 30-day refresh token that works once and is replaced each time. Both come in the response body; there are no cookies. If a refresh token is used twice, the whole session is revoked, so only one refresh may run at a time. Platform admins currently get an access token only (see `backend-todos.md`).
- **Workspace.** Chosen by subdomain (`<slug>.<domain>`) or by a `workspace` field on login. Google sign-in is optional for each workspace.
- **Typed client.** Can be generated from `/docs/openapi.json`.
- **Lists.** They come back as `{ data, next_cursor }` and use cursors only, never page numbers.
- **Errors.** One standard JSON format, with an error for each field, so they map straight onto form fields.
- **Money.** A string plus a currency code. Never convert it to a float.
- **Retries.** A POST can send an `Idempotency-Key` header, so a retried or double-clicked submit is safe.
- **Slow work.** It runs in the background, and the UI starts it and checks back by polling, because there is no websocket.
  - **File uploads:** get a signed link, upload straight to storage, mark the upload complete, then wait while the server measures the file.
  - **AI and exports:** the API answers 202 and the UI polls. Exports finish with a notice in the feed and a download link.
  - **Payments:** handled by Stripe Checkout, the billing portal and partner payout onboarding. Results arrive by webhook.
- **Scheduled jobs.** They change data in the background: offers expiring, unpaid orders cancelled, the dashboard and briefing, priority scores. This is why the UI needs a notification feed and a good way to refresh data.
- **Hidden from partners.** Partners never see the customer, the customer's price, or the workspace's own prices.

**Backend work AMI depends on.** The gaps are listed in `backend-todos.md`. Partner QC photo uploads are being added in erp-api separately, and the story needs them for any partner step that requires photos.

**Hosting.** A hosted live demo is planned, with the API and frontend deployed and demo accounts already set up.

**Still to decide:** the host, and the admin entry point. Workspace subdomains are deferred (see sign-in above).

## Brand Commitments

- The product is called **AMI**.
- All three areas share one design: the same look, components and navigation patterns. Only the content changes by role.
- The user wants AMI to feel modern, simple, easy to use, warm and inviting.
- It must not look like generic AI-generated templates.

## Evidence on Hand

**Demo data.** The erp-api seed (`/Users/leartmekolli/Desktop/erp-api/src/cli/seed*.ts`) creates a platform admin and the workspaces `demo` and `sandbox`, with catalog, pricing, workflows, partners (Northcast Foundry, Layerline Prints), customers (Luna Jewels, Mira Studio), plans, payments and AI data.

**Reference docs** for the API:
- `README.md`
- `docs/discovery/domain-map.md` (glossary and product decisions)
- `docs/discovery/industry-terms.md`
- `docs/adr/`

**Not yet available:** no logo, no real customers, no testimonials and no usage numbers. Don't make any of these up.

## Product Principles

1. **Engineering first.** The token refresh, uploads, polling, money handling and errors are built once in the foundation, and every screen reuses them.
2. **A finished story before a wider one.** Get one order working across staff and partners, end to end, before building more screens.
3. **Built for daily use.** Staff and partner screens are for people who work in them all day: dense, fast, keyboard-friendly, with batch actions.
4. **Show background work honestly.** Pending, measuring, polling and expired are real states the user can see, never hidden behind a spinner.
5. **Show only what the user can do.** Permissions and roles decide what appears. Partners never see customers, customer prices or workspace prices.

## Accessibility & Inclusion

Target: WCAG 2.2 AA.
- Everything works with a keyboard alone, and focus is always visible.
- Text and interface parts meet AA contrast.
- Every control, field and error has a label that screen readers announce.
- Animations can be turned off, using `prefers-reduced-motion`.
- Status never relies on colour alone: it always has a word or an icon too.
