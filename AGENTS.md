# Agent Rules

## Coding Sessions

During every coding session:

1. Create logs/agent-session.md
2. Append every reasoning step.
3. Record:
   - files read
   - commands executed
   - code generated
4. **Plan before implementing**: before making any code changes, outline every file you intend to create or modify and describe each change (e.g. new function, updated logic, migration added). Wait for the user to approve with "approved" before proceeding with implementation.
5. Show a message that reads DONE! and an optional brief description of what was done when the current development is complete.

## Workflow

- On a prompt "create commits" show a preview of meaningful commits and wait for approval to commit; the approval prompt will be "approved". Show the files affected and the message that will be included in the commit. Each commit must include the active agent as a co-author using a `Co-authored-by:` trailer with no email address (e.g. `Co-authored-by: GitHub Copilot <>`). When the active agent is GitHub Copilot, also add a second `Co-authored-by:` trailer identifying the sub-agent model being used (e.g. `Co-authored-by: Claude Sonnet 4.6 <>`). Use an interactive rebase (`git rebase -i`) after committing to amend each commit and append the trailer(s) to its message body.
- On a prompt "create PR" show a preview of the PR and wait for approval to create the PR; the approval prompt will be "approved". Before writing the preview, read every relevant route file (e.g. `routes/api.php`, `routes/web.php`, `routes/auth.php`) and cross-reference each endpoint mentioned in the description — HTTP method, full path, and parameter names — against the actual `Route::` declarations. Never invent, paraphrase, or carry over endpoint details from commit messages alone; every endpoint reference in the PR must exactly match its definition in the source PHP route files. Every PR description must follow this structure, including only the sections that apply:

  **Title** — imperative, prefixed with the conventional commit type (e.g. `feat:`, `fix:`, `chore:`).

  **## Summary** — 2–4 sentences describing what was added/changed and why.

  **## Changes** — grouped by layer (e.g. Backend, Frontend, Tests). Each group lists bullet points prefixed with the commit type in bold backticks (e.g. **`feat: ...`**), each followed by an em-dash and a one-sentence explanation of what the commit does and any non-obvious decisions made.

  **## Files Changed** — a markdown table with columns `File` and `Change`, one row per file, describing the nature of the change (new, modified, deleted) and what it contains.

  **## QA Steps** — numbered, concrete steps a reviewer must follow to manually verify the changes in a local or staging environment. Each step must be specific and actionable (navigate to URL, run command, assert exact outcome), covering the happy path, relevant edge cases, and error paths. Include any non-obvious setup prerequisites (credentials, env vars, seed data) as the first step when applicable.
- On a prompt "send changes to new branch": (1) inspect the current changes, propose three meaningful branch name options, and wait for the user to pick one; (2) once a branch name is approved, create the branch immediately without creating any committs.

## Code Quality

- Create a doc block for all newly created or modified PHP functions showing all parameters, return value, and an explanation of the logic involved in the function.
- Each doc block must include `@param` tags for all function parameters, an `@return` tag, and a `Logic:` line that explains what the function does.
- Create tests for every newly created function.
- Create tests for all newly created frontend components and keep those tests up to date whenever component code changes.
- **Unit-test service and algorithm logic in isolation**: when creating or modifying a service-layer method, add a corresponding test in `tests/Unit/Services/` that mocks all repository dependencies with Mockery — never touch a real database in these tests. When creating or modifying a pure-logic class (calculators, formula helpers, formatters) that has no database dependency, test it in `tests/Unit/` as a pure function. Repository methods that implement non-trivial algorithms (e.g. seat-assignment formulas, rotation sequences) must have dedicated tests in `tests/Unit/Repositories/` using `RefreshDatabase` and raw DB fixtures rather than going through the HTTP stack. Unit tests must cover the happy path plus all meaningful edge cases (boundary conditions, wrap-around, out-of-order input, empty collections).

## Frontend

- When creating new layouts or pages, extract as many reusable components as possible; prefer small, focused components over large monolithic ones.
- All UI state updates must be fully reactive: merge new data into existing component state directly (e.g. from an API response already in hand) rather than triggering a full page refresh or a redundant HTTP re-fetch. A full refresh is only acceptable when the update scope is too broad to merge incrementally, or when stale server-side session/auth state makes a full reload the correct behaviour.
- Minimise perceived latency: perform all client-side validation before firing any network request; apply optimistic updates immediately (flip state before the API call and roll back on failure) wherever the outcome is predictable; and show loading indicators inline next to the triggering element rather than blocking the whole page. Minimize Payload Size, only send the fields you need, use pagination or cursor-based loading, avoid sending deeply nested structures if not required.
- **Mobile-First Layout**: Always design and implement UI using a mobile-first approach. Start with base styles targeting small screens (≥320px), then layer responsive overrides using Tailwind's `sm:`, `md:`, `lg:`, and `xl:` prefixes for progressively larger viewports. Never use unprefixed layout utilities (e.g. `flex`, `grid`, `hidden`) if they would break the mobile layout — make the mobile state the default and override upward.

## API

- **Standardise controller responses**: always return `response()->json(['key' => $payload])` with
  a descriptive named key rather than returning a `JsonResource` or `ResourceCollection` directly.
  Returning a resource or collection bare from a controller can introduce automatic `{ data: [] }`
  wrapping that, when combined with response-envelope middleware, produces deeply nested paths that
  are brittle to consume. Use a named key that describes the payload — plural for collections
  (`'aliases'`, `'items'`), singular for single resources (`'alias'`, `'item'`). This produces a
  consistent, predictable response shape across all endpoints.

## Architecture

- Avoid fat controllers: keep controllers thin, move business logic to services, database queries to repositories, validation to FormRequest classes, and API JSON responses to API Resource classes.
- Do not use inline database queries inside service classes; all database queries must be handled through repository classes.

## Models

- When creating new models, explicitly define the table name and primary key properties.

## Data Modelling

- Never reference a specific element name, slug, or ID in business logic or UI components to trigger special behaviour. Instead, add a descriptive boolean attribute to the data model (e.g. `score_override`, `mutually_exclusive`) and drive the behaviour from that attribute. This keeps logic data-driven and extensible without requiring code changes.

## Database

- **Indexes**: whenever a migration adds a column used in a `WHERE` clause, a `JOIN` condition, or an `ORDER BY`, add an index for it in the same migration. Composite indexes should reflect the most common query filter order. Foreign key columns are always indexed.
- **Injection prevention**: never concatenate user input into raw SQL strings. Use Eloquent query builder methods (`where`, `join`, `orderBy`, etc.) or named/positional bindings (`whereRaw('col = ?', [$value])`) for all dynamic values. Never pass unvalidated input directly to `DB::statement`, `DB::select`, or `whereRaw`.
- **Selective columns**: always specify only the columns needed in `select([...])` / `get([...])` calls. Never use `SELECT *` in repository queries. In joins, prefix ambiguous column names with their table name to avoid collisions and unintended data leakage.
- **Eloquent vs Query Builder**: Default to Eloquent models when the result needs model features — relationships, accessors, mutators, observers, casts, or API Resources. Switch to `DB::table()` (query builder) when none of those features are needed and the query is performance-sensitive: bulk aggregations, reporting queries, large set operations, or any path where hydrating full model objects is measurable overhead. Never mix both within the same repository method — pick one and be consistent for that query's purpose.

## Engineering Standards

### Error Handling & Logging
- **Never leave a catch block empty or silent.** Every `catch` must emit a structured log entry at
  the appropriate level: `error` for unexpected failures, `warning` for acceptable partial failures,
  `info` for recoverable conditions. Silently swallowing exceptions is always wrong.
- **Structured, contextual logging only.** Every log call must include a context array with
  relevant identifiers (e.g. resource IDs, user ID, IP address, exception message). A bare string
  with no context is not acceptable.
- **Wrap all database transactions in try/catch.** On failure, log diagnostic details (query,
  bindings) that must never be returned to the client, then re-throw as a user-facing error.
- **Wrap all external service calls (mail, HTTP, queues) in try/catch.** Log the failure and
  continue where partial failure is acceptable — an external service error must not abort an
  otherwise successful operation.
- **Always log before suppressing an exception.** If a catch block redirects or returns a fallback
  value, the exception must still be logged before doing so.
- **Keep HTTP concerns out of non-HTTP layers.** Repositories and services must throw typed domain
  exceptions. HTTP status mapping belongs in controllers or a global exception handler.
- **Standardise the API error response shape.** All JSON error responses must follow the same
  envelope structure (e.g. always include both `message` and `errors` keys). Enforce this in the
  global exception handler, not scattered across individual controllers.
- **Configure the global exception handler explicitly:** sanitise sensitive fields from error
  context; map common domain exceptions to appropriate HTTP status codes; log all unhandled
  exceptions with a correlation/request ID that can be quoted by API clients.

### Architecture & Layering
- **Respect the established layer boundaries.** Business logic belongs in services, data access in
  repositories, HTTP concerns in controllers, and response shaping in dedicated resource/presenter
  classes. Never skip a layer.
- **Favour domain-scoped classes over god objects.** When a repository or service grows to cover
  multiple unrelated domain concerns, split it along those boundaries rather than adding to it.
- **Repositories return raw data only.** Never assemble API response arrays or apply domain/business
  rules inside a repository. Presentation belongs in resource classes; rules belong in services.
- **Presentation-layer components (middleware, controllers) must not reach past the service
  boundary.** Inject the relevant service — never a repository directly.

### Security
- **All mutation routes (`POST`, `PUT`, `PATCH`, `DELETE`) must require authentication.** No
  write-capable endpoint is ever public.
- **Resource-scoped routes must verify ownership or membership** before any read or write on that
  resource (via a policy, middleware, or a shared base-controller helper).
- **Endpoints that return personal or sensitive catalogue data must require authentication.**
- **Apply rate limiting to all API mutation routes.**

### Performance
- **Cache stable, rarely-changing data** using `Cache::remember()` (or equivalent). Never use a
  database-backed cache store as the default in production; prefer an in-memory store (Redis,
  Memcached).
- **Always use Redis as the application cache store.** Set `CACHE_STORE=redis` in `.env` for every
  environment (local, staging, production). A database-backed cache store (`database`) adds write
  pressure to the same database being offloaded and must never be used. Whenever caching is
  introduced or modified, add a companion test in `tests/Unit/` that asserts
  `config('cache.default')` equals `'redis'`, confirming the environment is correctly configured
  before any cache operation is exercised. Name the test class after its domain (e.g.
  `CacheConfigurationTest`) and place it in `tests/Unit/`.
- **Avoid race conditions on computed sequences.** When deriving a next-sequence value inside a
  transaction (e.g. `MAX() + 1`), use a row-level lock to serialise concurrent writes.

### Data Modelling
- **Replace repeated bare string constants for domain states with typed enums.** Never introduce a
  new plain-string status or role value; add a case to the relevant enum instead.

### Frontend
- **Decompose large components.** When a component exceeds a manageable size or handles multiple
  unrelated concerns, extract focused sub-components rather than adding more logic to the existing
  file.
- **Batch related mutations into a single API call** rather than firing sequential requests for what
  is logically one user action.
- **Do not suppress linter dependency warnings** (e.g. `exhaustive-deps`) without an explicit
  inline comment justifying why the omission is safe.
- **Every `eslint-disable` comment must include a trailing `// safe: <reason>` explanation** describing why suppressing that rule is correct in context. Always disable only the specific rule required (e.g. `// eslint-disable-next-line no-explicit-any`) — never use a bare `eslint-disable` without a rule name. File-level disables are forbidden; use per-line or per-block directives only.
- **Derive all computed flags and derived state from a single authoritative data source** (e.g. an
  API response or a shared store) rather than from local ad-hoc calculations that can drift out of
  sync.
