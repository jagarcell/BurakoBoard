# Agent Rules

## Workflow

- On a prompt "create commits" show a preview of meaningful commits and wait for approval to commit; the approval prompt will be "approved".
- On a prompt "create PR" show a preview of the PR and wait for approval to create the PR; the approval prompt will be "approved".
- On a prompt "send changes to new branch": (1) inspect the current changes, propose three meaningful branch name options, and wait for the user to pick one; (2) once a branch name is approved, create the branch immediately without creating any committs.

## Code Quality

- Create a doc block for all newly created or modified PHP functions showing all parameters, return value, and an explanation of the logic involved in the function.
- Each doc block must include `@param` tags for all function parameters, an `@return` tag, and a `Logic:` line that explains what the function does.
- Create tests for every newly created function.
- Create tests for all newly created frontend components and keep those tests up to date whenever component code changes.

## Frontend

- When creating new layouts or pages, extract as many reusable components as possible; prefer small, focused components over large monolithic ones.

## Architecture

- Avoid fat controllers: keep controllers thin, move business logic to services, database queries to repositories, validation to FormRequest classes, and API JSON responses to API Resource classes.
- Do not use inline database queries inside service classes; all database queries must be handled through repository classes.

## Models

- When creating new models, explicitly define the table name and primary key properties.
