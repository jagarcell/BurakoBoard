# Agent Rules

## Workflow

- On a prompt "commits preview" show a preview of meaningful commits and wait for approval to commit; the approval prompt will be "approved".
- On a prompt "create PR" show a preview of the PR and wait for approval to create the PR; the approval prompt will be "approved".

## Code Quality

- Create a doc block for all PHP functions showing the parameters, return value, and an explanation of the logic involved in the function.
- Create tests for every newly created function.
- Create tests for all newly created frontend components and keep those tests up to date whenever component code changes.

## Architecture

- Avoid fat controllers: keep controllers thin, move business logic to services, database queries to repositories, validation to FormRequest classes, and API JSON responses to API Resource classes.

## Models

- When creating new models, explicitly define the table name and primary key properties.
