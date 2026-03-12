# Agent Rules

## Coding Sessions

During every coding session:

1. Create logs/agent-session.md
2. Append every reasoning step.
3. Record:
   - files read
   - commands executed
   - code generated
4. Show a message that reads DONE! and an optional brief description of what was done when the current development is complete.

## Workflow

- On a prompt "create commits" show a preview of meaningful commits and wait for approval to commit; the approval prompt will be "approved".
- On a prompt "create PR" show a preview of the PR and wait for approval to create the PR; the approval prompt will be "approved". The PR description must include a **QA Steps** section with concrete, numbered steps a reviewer must follow to manually verify the changes in a local or staging environment. Each step must be specific and actionable (e.g., navigate to URL, submit form, assert expected outcome), covering both the happy path and relevant edge cases.
- On a prompt "send changes to new branch": (1) inspect the current changes, propose three meaningful branch name options, and wait for the user to pick one; (2) once a branch name is approved, create the branch immediately without creating any committs.

## Code Quality

- Create a doc block for all newly created or modified PHP functions showing all parameters, return value, and an explanation of the logic involved in the function.
- Each doc block must include `@param` tags for all function parameters, an `@return` tag, and a `Logic:` line that explains what the function does.
- Create tests for every newly created function.
- Create tests for all newly created frontend components and keep those tests up to date whenever component code changes.

## Frontend

- When creating new layouts or pages, extract as many reusable components as possible; prefer small, focused components over large monolithic ones.
- All UI state updates must be fully reactive: merge new data into existing component state directly (e.g. from an API response already in hand) rather than triggering a full page refresh or a redundant HTTP re-fetch. A full refresh is only acceptable when the update scope is too broad to merge incrementally, or when stale server-side session/auth state makes a full reload the correct behaviour.
- Minimise perceived latency: perform all client-side validation before firing any network request; apply optimistic updates immediately (flip state before the API call and roll back on failure) wherever the outcome is predictable; and show loading indicators inline next to the triggering element rather than blocking the whole page. Minimize Payload Size, only send the fields you need, use pagination or cursor-based loading, avoid sending deeply nested structures if not required.

## Architecture

- Avoid fat controllers: keep controllers thin, move business logic to services, database queries to repositories, validation to FormRequest classes, and API JSON responses to API Resource classes.
- Do not use inline database queries inside service classes; all database queries must be handled through repository classes.

## Models

- When creating new models, explicitly define the table name and primary key properties.

## Data Modelling

- Never reference a specific element name, slug, or ID in business logic or UI components to trigger special behaviour. Instead, add a descriptive boolean attribute to the data model (e.g. `score_override`, `mutually_exclusive`) and drive the behaviour from that attribute. This keeps logic data-driven and extensible without requiring code changes.
