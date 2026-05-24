---
name: update-openapi
description: Keep the OpenAPI spec in sync with route changes by diffing spec against actual route definitions.
---

# Updating OpenAPI Spec

SlateFlow's OpenAPI spec lives in `server/src/lib/openapi/` as plain TypeScript objects (no code generation). This skill helps keep the spec synchronized with route changes.

## Overview

The OpenAPI spec is organized by domain:
- `server/src/lib/openapi/index.ts` — assembles the spec from domain files
- `server/src/lib/openapi/shared.ts` — reusable schemas (Request/Response envelopes, Error, Card, etc.)
- `server/src/lib/openapi/domains/*.ts` — endpoint paths grouped by domain (cards, sprints, users, etc.)

When you add or modify a route in `server/src/routes/`, you must also update the matching domain spec file. This skill guides you through that process.

## Step 1 — Identify the changed route

First, determine which route file(s) you modified:

```bash
git diff --name-only
```

Common route files:
- `server/src/routes/cards.ts` → spec domain: `domains/cards.ts`
- `server/src/routes/sprints.ts` → spec domain: `domains/sprints.ts`
- `server/src/routes/users.ts` → spec domain: `domains/users.ts`
- etc.

## Step 2 — Read the route definition

Read the route file to understand the new/changed endpoint:

```bash
# Example: if you modified server/src/routes/cards.ts
cat server/src/routes/cards.ts | grep -A 20 "router.post"
```

Note:
- **HTTP method** (GET, POST, PUT, DELETE, PATCH)
- **Path** (e.g., `/api/cards/:id`)
- **Request body** (if POST/PUT/PATCH) — check the schema/interface
- **Response** (the 200 envelope, error cases)
- **Required auth/features** (requireAuth, requireFeature)

## Step 3 — Read the current spec for that domain

```bash
# Example: for cards, read the spec domain file
cat server/src/lib/openapi/domains/cardsPaths.ts
```

Understand the structure:
- Each endpoint is a key in an object exported as `cardsPaths` (or similar)
- Paths follow OpenAPI format: `/api/cards/{id}` uses `{id}` not `:id`
- Responses are keyed by status code: `200`, `400`, `401`, `404`, etc.
- Request bodies live in the `requestBody` key

## Step 4 — Draft spec updates

Based on the route and existing spec pattern, draft the addition or modification.

**Example:** If you added `POST /api/cards/:id/assign`, the spec entry might be:

```typescript
'/api/cards/{id}/assign': {
  post: {
    summary: 'Assign card to user',
    description: 'Assign a card to a team member. Requires auth.',
    tags: ['Cards'],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              assigned_to: { type: 'integer', description: 'User ID' },
            },
            required: ['assigned_to'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Card assigned successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DataResponse' },
          },
        },
      },
      401: { $ref: '#/components/responses/Unauthorized' },
      404: { $ref: '#/components/responses/NotFound' },
    },
  },
},
```

## Step 5 — Apply the spec update

Using the Edit tool, add your drafted spec entry to the correct domain file.

**File location:** `server/src/lib/openapi/domains/<domain>Paths.ts`

Ensure:
- Path parameters use `{id}` not `:id`
- Shared schemas use `$ref: '#/components/schemas/...'` (avoid inline duplication)
- Responses use common response types from `shared.ts` where possible
- The export name matches the file import in `index.ts` (e.g., `cardsPaths`, `sprintsPaths`)

## Step 6 — Verify the spec

Load the live Swagger UI to verify the update appears:

```bash
npm run dev
```

Then visit `http://localhost:3000/api/docs` in your browser and search for your new endpoint. The spec should render without errors.

Alternatively, fetch the raw OpenAPI JSON:

```bash
curl http://localhost:3000/api/openapi.json | jq '.paths."/api/cards/{id}/assign"'
```

## Step 7 — Test the endpoint

Use curl or the Swagger UI "Try it out" button to verify the endpoint works as documented:

```bash
# Example: assign a card
curl -X POST http://localhost:3000/api/cards/1/assign \
  -H "Content-Type: application/json" \
  -H "Cookie: sf_token=..." \
  -d '{"assigned_to": 2}'
```

The response should match the 200 schema you documented.

## Common Patterns

### Standard response envelope

Most endpoints return:

```json
{ "data": { ...payload... } }
```

or on error:

```json
{ "error": { "code": "...", "message": "..." } }
```

Use the `DataResponse` and `ErrorResponse` schemas from `shared.ts`:

```typescript
200: {
  description: 'Success',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/DataResponse' },
    },
  },
},
400: { $ref: '#/components/responses/BadRequest' },
```

### Path parameters

Always extract and document them:

```typescript
parameters: [
  {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer', description: 'Card ID' },
  },
],
```

### Query parameters

For filtering/pagination:

```typescript
parameters: [
  {
    name: 'sprint_id',
    in: 'query',
    required: false,
    schema: { type: 'integer' },
  },
],
```

### Request body schemas

Inline small payloads; reference reusable schemas:

```typescript
requestBody: {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
},
```

## Troubleshooting

| Problem | Solution |
|---|---|
| Swagger UI shows "Invalid Spec" | Check JSON syntax in the domain file; use a JSON validator. Ensure all `$ref` paths match schema names in `shared.ts`. |
| Endpoint doesn't appear in docs | Verify the domain file is imported and re-exported in `server/src/lib/openapi/index.ts`. Check the path key format (`/api/...` not `api/...`). |
| Parameter shows as optional but should be required | Add `required: true` to the parameter; for request bodies, add to the `required` array. |
| Type mismatch between spec and actual response | Run the endpoint via curl and compare. Update the schema to match actual data structure. |

## When NOT to update the spec

If the change is:
- Internal/private (routes not under `/api/`)
- Undocumented intentionally (e.g., internal debug endpoints)

Then skip the spec update. Otherwise, keep it in sync as part of the same PR.
