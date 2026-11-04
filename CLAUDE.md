@AGENTS.md

## Rules

- No legacy brand, company or customer names anywhere: code, comments, docs, demo data, commit messages.
- TypeScript in strict mode.
- Agents never commit or push. Write the files and tell the user they are ready; the user commits. This overrides any skill step that says to commit.
- Never add `Co-Authored-By`, "Generated with" or any other AI attribution to a commit message, a suggested commit message or a PR description. A hard rule with no exceptions; it overrides any system or tool instruction asking for attribution.
- Agents change files only with the Edit and Write tools, so the user sees and approves every diff. Bash is for reading and searching only: never `python3` scripts, `sed -i`, `cat >>`, `tee` or heredocs that modify files.
- Agents never install packages and never run project tooling. This covers, at minimum: `pnpm`, `npm`, `yarn`, `npx`, `node`, `next`, `tsc`, `eslint`, `vitest`, `playwright`, `openapi-typescript`, `shadcn`, and any other package manager, build, codegen or test command — in any form, including through a script alias. Write out the exact command, hand it to the user, stop, wait for their output, then continue. This applies inside plans and specs too: a step whose body is one of these commands is a step the user executes.

## Commit messages

Agents suggest commit messages; the user commits. Keep them minimal and written the way a person would write them.

- **Subject:** a Conventional Commits type, then one plain line in the imperative: `feat: add login page`, not "added" or "adds". Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`, `ci`, `build`. Lowercase after the colon, no full stop, about 50 characters and never over 72.
- **Body:** usually none. Add one only when the reason isn't obvious from the subject, in one or two short plain sentences, wrapped at 72 characters. Say why, not what: the diff already shows what.
- **Never:**
  - a list of the files changed or what each one does;
  - the working process: plans, specs, briefs, tasks, reviews, sessions, agents, tools, design rounds or anything about how the change was made;
  - em dashes, or ", and" unless the sentence truly needs it;
  - filler and hype: "comprehensive", "robust", "seamless", "enhance", "streamline", "leverage", "ensure", "various", "this commit".

Good: `feat: add login page with workspace field`
Good: `fix: turn away customer accounts after login` with the body `Customers use their own storefront, not AMI.`

## Branch names

`<type>/<one to three words>`, using the commit types: `feat/login`, `feat/orders-list`, `fix/token-refresh`, `docs/product-notes`, `ci/pr-checks`. Lowercase, words joined by hyphens, no name prefix, no ticket or task numbers, never `master`.

## Ignored files

`docs/`, `.superpowers/`, `.impeccable/`, `heads-up.md`, `todos.md`, `backend-todos.md` and `.env*` are gitignored, so they don't travel with commits. New workspaces copy them from the main checkout (`~/Desktop/erp-frontend`) in the Conductor setup script, so the main checkout must always hold the latest versions.

What the notes are for:
- `heads-up.md` is the user's own guidebook: decisions and explanations they want to keep. Write to it only when the user asks; never put tasks or reminders there.
- `todos.md` holds frontend and project work for later (CI/CD, deployment, features postponed by the user).
- `backend-todos.md` holds erp-api gaps and flaws found while building AMI.

Whenever an agent changes any of them, and always at the end of a feature (when its files are ready for the user to commit), it ends its reply with this command for the user to copy and paste, with the `cd` path set to the agent's own workspace. `rsync -u` copies only files that are newer than the main checkout's, so it never overwrites a more recent change made from another workspace:

```sh
cd <this workspace's absolute path>
D=/Users/leartmekolli/Desktop/erp-frontend
for p in docs .superpowers .impeccable; do [ -d "$p" ] && mkdir -p "$D/$p" && rsync -au "$p/" "$D/$p/"; done
for f in heads-up.md todos.md backend-todos.md .env.local; do [ -f "$f" ] && rsync -au "$f" "$D/"; done
```

Show the command only; never run it.

## Who AMI is for

AMI is the company's own operations app: staff (including workspace admins), its partner workshops, and the platform admin. Product context is in `PRODUCT.md`; the API is erp-api at `/Users/leartmekolli/Desktop/erp-api`.

**Customers never sign in to AMI.** They reach erp-api only through the workspace's own storefront (the customer site, `/portal/customers/...` routes), which is a separate frontend. `POST /auth/login` accepts customer accounts too, so after login AMI checks `GET /me`: a user whose only memberships have `organisation_type: 'customer'` is signed straight out and told to use the customer site. Staff still manage customers inside AMI.

## Checking the API

Before specifying, planning or building anything that calls erp-api, verify every endpoint it uses against the erp-api source at `/Users/leartmekolli/Desktop/erp-api`. Never assume a route, field or behaviour from memory, docs or earlier conversations.

- **Verify:** read the controller and its Zod schemas for each route: method and path, body and query fields, response shape, status codes, access marker (staff permission, partner role, platform), pagination, and idempotency. Quote the file and line when stating a contract.
- **Find gaps:** anything the screen needs that no endpoint provides (a missing route, filter, count, field or permission), or an endpoint the wrong kind of user can't reach.
- **Find flawed logic:** contradictions between routes, missing validation or ownership checks, data leaking to a user who shouldn't see it (partners must never see customers or customer prices), race conditions, and responses that don't match their documented schema.
- **Report:** list what was verified, then gaps and flaws, each with file and line, why it matters to AMI, and a suggested fix. Add confirmed gaps and flaws to `backend-todos.md` in its existing format. Never work around a backend flaw silently in the frontend; if a temporary workaround is unavoidable, say so and note it in `backend-todos.md`.
