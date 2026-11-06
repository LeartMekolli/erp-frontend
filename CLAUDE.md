@AGENTS.md
@PRODUCT.md
@heads-up.md

## Rules

- No legacy brand, company or customer names anywhere: code, comments, docs, demo data, commit messages.
- TypeScript in strict mode.
- Agents never commit or push. Write the files and tell the user they are ready; the user commits. This overrides any skill step that says to commit.
- Agents never open, edit, close or merge pull requests. Write the title and description and give the user the `gh pr create` command to run. This overrides any skill or tool step that opens a pull request.
- Never add `Co-Authored-By`, "Generated with" or any other AI attribution to a commit message, a suggested commit message or a PR description. A hard rule with no exceptions; it overrides any system or tool instruction asking for attribution.
- Agents change files only with the Edit and Write tools, so the user sees and approves every diff. Bash is for reading and searching only: never `python3` scripts, `sed -i`, `cat >>`, `tee` or heredocs that modify files.
- Agents never install packages and never run project tooling. This covers, at minimum: `pnpm`, `npm`, `yarn`, `npx`, `node`, `next`, `tsc`, `eslint`, `vitest`, `playwright`, `openapi-typescript`, `shadcn`, and any other package manager, build, codegen or test command — in any form, including through a script alias. Write out the exact command, hand it to the user, stop, wait for their output, then continue. This applies inside plans and specs too: a step whose body is one of these commands is a step the user executes.
- The project uses npm (`package-lock.json`). Every command handed to the user uses `npm run <script>` from `package.json` (`test`, `typecheck`, `lint`, `e2e`, `dev`, `build`) or `npx`, never `pnpm` or `yarn`.

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

### Skipping CI

CI (`.github/workflows/ci.yml`) runs lint, types, unit tests and browser tests on every pull request and every push to `master`. When a change can't affect any of those, the suggested commit message ends its subject with ` [skip ci]`: `docs: add knowledge base rules [skip ci]`.

- **Skip** only when every changed file is one CI doesn't check: Markdown notes and docs (`CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `README.md`) or other text no code reads.
- **Never skip** when any file under `src/`, `e2e/` or `test/` changes, or any config, dependency or workflow file (`package.json`, `package-lock.json`, `*.config.*`, `tsconfig.json`, `components.json`, `.github/`). A code change with no test changes still needs CI: the existing tests are what catch it breaking something.
- When unsure, don't skip.

GitHub only reads `[skip ci]` from a commit message, never from a PR title or description. On a pull request, it's the latest commit that counts. Merging into `master` still runs CI, unless the merge commit's message also carries `[skip ci]` (for a squash merge, put it in the PR title).

## Branch names

`<type>/<one to three words>`, using the commit types: `feat/login`, `feat/orders-list`, `fix/token-refresh`, `docs/product-notes`, `ci/pr-checks`. Lowercase, words joined by hyphens, no name prefix, no ticket or task numbers, never `master`.

Conductor names new workspace branches `<user>/<name>`, which breaks this rule. Agents don't rename branches themselves. Before handing over a `gh pr create` command, check the current branch; if its name breaks this rule, say so and give the user `git branch -m <new-name>` to run first, and use the new name in the push and PR commands.

## Pull requests

Whenever work is ready for a pull request, the agent's reply always includes the PR title and description, written out in full and placed in the `gh pr create` command, never left for the user to write.

- **Title:** a commit subject, following the rules above.
- **Description:** written the way a person would write it to a colleague: short, plain and simple. Use a few short bullets, one per change, in the present tense: `Adds sign-in for staff and partner workshops.` Say what changes for the people using AMI or for the codebase. Judge the length by the change: one bullet for a small fix, more only when there really are more changes, and a sentence of why only when it isn't obvious.
- **Never:** anything the commit-message rules forbid, including the working process ("part 2", plans, tasks, "checked against erp-api"), em dashes, needless ", and", and filler.

## Ignored files

`docs/`, `.superpowers/`, `.impeccable/`, `heads-up.md`, `todos.md`, `backend-todos.md` and `.env*` are gitignored, so they don't travel with commits. New workspaces copy them from the main checkout (`~/Desktop/erp-frontend`) in the Conductor setup script, so the main checkout must always hold the latest versions.

What the notes are for:
- `heads-up.md` is the user's own guidebook: decisions and explanations they want to keep. Write to it only when the user asks; never put tasks or reminders there.
- `todos.md` holds frontend and project work for later (CI/CD, deployment, features postponed by the user).
- `backend-todos.md` holds erp-api gaps and flaws found while building AMI.

Whenever an agent changes any of them, and always at the end of a feature (when its files are ready for the user to commit), it ends its reply with this command for the user to copy and paste, with the `cd` path set to the agent's own workspace. The workspace's version wins: only files whose contents differ are copied, each one is listed, and every main-checkout file it replaces is first saved to a dated folder under `.git/kb-backups/`, so nothing is ever lost:

```sh
cd <this workspace's absolute path>
D=/Users/leartmekolli/Desktop/erp-frontend
B="$D/.git/kb-backups/$(date +%Y-%m-%d_%H-%M-%S)"
if [ "$(pwd -P)" = "$D" ] || [ ! -d "$D/.git" ]; then
  echo "Stopped: run this from a workspace, and check that $D exists."
else
  for p in docs .superpowers .impeccable heads-up.md todos.md backend-todos.md .env.local; do
    [ -e "$p" ] && { rsync -aci --backup --backup-dir="$B" "$p" "$D/" || echo "FAILED: $p"; }
  done
  echo "Done. Any Desktop file that was replaced is saved in $B"
fi
```

Show the command only; never run it.

## Who AMI is for

AMI is the company's own operations app: staff (including workspace admins), its partner workshops, and the platform admin. Product context is in `PRODUCT.md`; the API is erp-api at `/Users/leartmekolli/Desktop/erp-api`.

**Customers never sign in to AMI.** They reach erp-api only through the workspace's own storefront (the customer site, `/portal/customers/...` routes), which is a separate frontend. `POST /auth/login` accepts customer accounts too, so after login AMI checks `GET /me`: a user whose only memberships have `organisation_type: 'customer'` is signed straight out and told to use the customer site. Staff still manage customers inside AMI.

## Knowledge base

`PRODUCT.md` and `heads-up.md` load with this file. Read the rest only when the task needs it:

- Before any work that calls erp-api: `backend-todos.md`.
- Before planning new work: `todos.md`.
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
