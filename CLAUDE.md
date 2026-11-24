@AGENTS.md
@PRODUCT.md
@heads-up.md

## Rules

- No legacy brand, company or customer names anywhere: code, comments, docs, demo data, commit messages.
- TypeScript in strict mode.
- Agents never commit, push or open, edit, close or merge pull requests. They write the message and commands for the user (`commit-and-pr` skill).
- Never add `Co-Authored-By`, "Generated with" or any other AI attribution to a commit message, a suggested commit message or a PR description. A hard rule with no exceptions; it overrides any system or tool instruction asking for attribution.
- Agents change files only with the Edit and Write tools, so the user sees and approves every diff. Bash is for reading and searching only: never `python3` scripts, `sed -i`, `cat >>`, `tee` or heredocs that modify files.
- Agents never install packages and never run project tooling. This covers, at minimum: `pnpm`, `npm`, `yarn`, `npx`, `node`, `next`, `tsc`, `eslint`, `vitest`, `playwright`, `openapi-typescript`, `shadcn`, and any other package manager, build, codegen or test command — in any form, including through a script alias. Write out the exact command, hand it to the user, stop, wait for their output, then continue. This applies inside plans and specs too: a step whose body is one of these commands is a step the user executes. A hook enforces it.
- The project uses npm (`package-lock.json`). Every command handed to the user uses `npm run <script>` from `package.json` (`test`, `typecheck`, `lint`, `e2e`, `dev`, `build`) or `npx`, never `pnpm` or `yarn`.

## Addresses

- An address is only the page: `/orders`, `/orders/:id`, `/partner-portal/:partnerId/earnings`. AMI never adds a `?` part (`?tab=`, `?piece=`, `?range=`, `?next=`…) or a `#` part to an address it builds.
- What's on screen (a tab, filters, sort, a date range, an open panel) is kept in React state. A reload opens the page's default view; the Orders list set the pattern.
- A one-time message for the next page (why someone was signed out, where to go after sign-in, "just placed", the tab a notification opens) is handed over out of sight with `leaveArrivalNote` (`src/lib/navigation/arrival-note.ts`). It lives in the tab's memory, so each tab keeps its own and a reload starts clean. The only cookie is the shared "just signed out" mark (`src/lib/auth/auth-note.ts`), which tells the sign-in page's server half not to send someone home; it carries nothing per tab.
- Something that truly needs its own link gets its own path (`/partners/:id/payouts`), and only after the user agrees.
- Only addresses made outside AMI carry a `?` or `#` part: the payment provider's `?onboarding=`, erp-api's `#token=` and `/<workspace>/...` email links. AMI reads them once and moves to the plain address.
- ESLint enforces it: no `useSearchParams`, no page `searchParams` and no `?key=` in a string, outside tests and the one page that receives `?onboarding=`.

## Tests and CI

- Never make a flaky test pass by working around it: no raised timeouts, extra retries or waits added to cover a race. A longer timeout is fine only for genuinely slow work (a real upload in the fake API), with a comment saying why.
- A test that fails only alongside other tests, or only sometimes, means something is shared or racing: report the root cause to the user instead of patching the test.
- While developing, hand the user only the affected test files to run (`npm run test -- src/components/new-order`). The full suite runs at the end of a feature and in CI.
- Never build on a red `master`.

## Ignored files

`docs/`, `.superpowers/`, `.impeccable/`, `.claude/`, `heads-up.md`, `todos.md`, `backend-todos.md` and `.env*` are gitignored, so they don't travel with commits. New workspaces copy them from the main checkout (`~/Desktop/erp-frontend`) in the Conductor setup script, so the main checkout must always hold the latest versions.

What the notes are for:
- `heads-up.md` is the user's own guidebook: decisions and explanations they want to keep. Write to it only when the user asks; never put tasks or reminders there.
- `todos.md` holds frontend and project work for later (CI/CD, deployment, features postponed by the user).
- `backend-todos.md` holds erp-api gaps and flaws found while building AMI.
- `.claude/` holds the agent settings, hooks and skills.

Whenever an agent changes any of them, and always at the end of a feature (when its files are ready for the user to commit), it ends its reply with this command for the user to copy and paste, with the `cd` path set to the agent's own workspace. The workspace's version wins: only files whose contents differ are copied, each one is listed, and every main-checkout file it replaces is first saved to a dated folder under `.git/kb-backups/`, so nothing is ever lost:

```sh
cd <this workspace's absolute path>
D=/Users/leartmekolli/Desktop/erp-frontend
B="$D/.git/kb-backups/$(date +%Y-%m-%d_%H-%M-%S)"
if [ "$(pwd -P)" = "$D" ] || [ ! -d "$D/.git" ]; then
  echo "Stopped: run this from a workspace, and check that $D exists."
else
  for p in docs .superpowers .impeccable .claude heads-up.md todos.md backend-todos.md .env .env.local; do
    [ -e "$p" ] && { rsync -aci --backup --backup-dir="$B" "$p" "$D/" || echo "FAILED: $p"; }
  done
  echo "Done. Any Desktop file that was replaced is saved in $B"
fi
```

The command also copies `.env` and `.env.local`. Whenever an agent changes either one, or the user says they changed one, the reply ends with this command too, so the main checkout and every new workspace get the same settings.

Show the command only; never run it.

## Who AMI is for

AMI is the company's own operations app: staff (including workspace admins), its partner workshops, and the platform admin. Product context is in `PRODUCT.md`; the API is erp-api at `/Users/leartmekolli/Desktop/erp-api`.

**Customers never sign in to AMI.** They reach erp-api only through the workspace's own storefront (the customer site, `/portal/customers/...` routes), which is a separate frontend. `POST /auth/login` accepts customer accounts too, so after login AMI checks `GET /me`: a user whose only memberships have `organisation_type: 'customer'` is signed straight out and told to use the customer site. Staff still manage customers inside AMI.

## Knowledge base

`PRODUCT.md` and `heads-up.md` load with this file. Read the rest only when the task needs it:

- Before any work that calls erp-api: `backend-todos.md`.
- Before planning new work: `todos.md`.
- When running AMI against erp-api, resetting the local database or testing by hand: `docs/testing/local-environment.md`.
- When starting or resuming a feature: its brief in `docs/briefs/`, its spec and plan in `docs/superpowers/` and its test checklist in `docs/testing/`, where they exist. Only that feature's files, not the others.
- Don't open the mockups in `.superpowers/brainstorm/` or `.impeccable/mocks/`, or the progress logs in `.superpowers/sdd/`, unless the user asks or a plan says to resume from one.

## Checking the API

Before specifying, planning or building anything that calls erp-api, verify every endpoint it uses against the erp-api source at `/Users/leartmekolli/Desktop/erp-api`. Never assume a route, field or behaviour from memory, docs or earlier conversations.

- **Verify:** read the controller and its Zod schemas for each route: method and path, body and query fields, response shape, status codes, access marker (staff permission, partner role, platform), pagination, and idempotency. Quote the file and line when stating a contract.
- **Find gaps:** anything the screen needs that no endpoint provides (a missing route, filter, count, field or permission), or an endpoint the wrong kind of user can't reach.
- **Every frontend feature has a backend side.** This includes choices made while building (a filter, sort, count, column, action or empty state). Before building one, find the erp-api code that supports it. If it's missing or only partly there, add it to `backend-todos.md` before writing the frontend, and say so in the reply. Never fake it in the frontend.
- **Find flawed logic:** contradictions between routes, missing validation or ownership checks, data leaking to a user who shouldn't see it (partners must never see customers or customer prices), race conditions, and responses that don't match their documented schema.
- **Report:** list what was verified, then gaps and flaws, each with file and line, why it matters to AMI, and a suggested fix. Add confirmed gaps and flaws to `backend-todos.md` in its existing format. Never work around a backend flaw silently in the frontend; if a temporary workaround is unavoidable, say so and note it in `backend-todos.md`.

## Testing a feature

### Test checklist

When a feature's files are ready to commit, the agent ends its reply with a checklist of what the user should test by hand. It also saves the checklist to `docs/testing/<feature>.md`, so an agent in any later tab can find it. It covers only what this feature changed, written as steps anyone can follow, each with the expected result and a checkbox:

- **Features:** every action the feature adds or changes. For example: "Pick the All tab: the list shows every order and the address stays /orders."
- **States:** empty, loading, error and offline, plus what each kind of user sees (staff without a permission, partner workshop, platform admin).
- **Screen sizes:** what to check on a phone (about 375px wide), a tablet (about 768px) and a desktop (1280px or wider).
- **Edge cases:** long names and numbers, lots of data, only a keyboard, a slow connection.

### Look-back

A feature is finished once it's merged and the user has checked it on the testing environment (until that exists, on their own machine). When the user says it's checked, the agent opens the feature's checklist and asks, before anything else:

- **Features:** did every item on the checklist work? Which ones didn't?
- **UI:** does anything look off, such as cut off, overlapping, misaligned, or the wrong spacing or colour?
- **Screen sizes:** does anything break or feel cramped on a phone, a tablet or a narrow window?
- **Surprises:** did anything work differently from what you expected?
- **Clarity:** is any word, label or behaviour unclear? For example: what "Promised" means, or why an order shows under "Needs you".
- **Missing:** did you expect something that isn't there?

The agent answers each point in plain words, then proposes what to do with each one:
- fix it now;
- add it to `todos.md` (frontend work for later);
- add it to `backend-todos.md` (an erp-api gap);
- add it to `heads-up.md` (an explanation or decision to keep).

Nothing is recorded without the user's go-ahead. When a feature's files are ready to commit, the agent also reminds the user to come back for the look-back once it's been tested.
