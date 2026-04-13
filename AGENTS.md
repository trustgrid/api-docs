# AGENTS.md — api-docs

This repo contains the Trustgrid OpenAPI 3.0 specification (`index.yaml`) and
Node.js tests that validate it. The published output is at apidocs.trustgrid.io.

---

## Commands

### Install dependencies
```sh
npm install
```

### Lint the OpenAPI spec (Redocly)
```sh
make lint
# equivalent:
npx @redocly/cli lint index.yaml
```

### Run all tests
```sh
make test
# equivalent:
npm test
```

### Run a single test file
```sh
node --test tests/lifecycle-state.test.js
```

### Run a single test by name (grep)
```sh
node --test --test-name-pattern "LifecycleStateRequest" tests/lifecycle-state.test.js
```

### Validate OpenAPI with kin-openapi (CI also runs this)
```sh
go run github.com/getkin/kin-openapi/cmd/validate@latest --defaults -- index.yaml
```

---

## Repo Layout

```
index.yaml          # The canonical OpenAPI 3.0 spec — the only file you edit
redocly.yaml        # Redocly lint config (extends recommended; a few rules disabled)
tests/              # Node.js test files (*.test.js)
Legacy Swagger/     # Read-only legacy Swagger 2.0 spec, not modified
docs/               # Internal docs (PRDs, review notes) — not published
```

---

## The Spec: `index.yaml`

This is one big OpenAPI 3.0 file (~12k lines). All additions go here.

### Top-level structure
1. `info` — version, title, description
2. `tags` — tag definitions with descriptions and Trustgrid docs links
3. `x-tagGroups` — Redocly grouping of tags in the sidebar
4. `paths` — all endpoints
5. `components` — shared `schemas`, `parameters`, `responses`

### Path ordering convention
- Legacy (no version prefix) paths come first, marked `deprecated: true`
- `/v2/` paths follow
- Within a resource family (e.g. `/v2/node/{nodeID}/...`), paths are grouped
  together in the file, sorted by path string
- Cluster endpoints mirror node endpoints; they live in a separate block

### Parameter conventions
- **Always use `$ref`** for parameters defined in `components/parameters`
  (e.g. `nodeID`, `clusterFQDN`). Never inline them:
  ```yaml
  parameters:
    - $ref: '#/components/parameters/nodeID'
  ```
- Parameters **not** in `components/parameters` (e.g. `containerID`, `imageID`)
  are defined inline at the operation level.
- Path-level `parameters` go under the path key; operation-level parameters
  go under the verb (`get`, `put`, etc.).

### Operation conventions
- `operationId`: camelCase, unique across the whole spec. Use descriptive verbs:
  `listXxx`, `getXxx`, `createXxx`, `updateXxx`, `deleteXxx`, `PostV2...`
  (the latter pattern for operations without a cleaner name).
- `summary`: sentence case, no period. Describes what the endpoint *does* from
  the user's perspective.
- `description`: use the `|-` block scalar. Format:
  ```yaml
  description: |-
    Human-readable explanation of what the endpoint does.

    ---

    Requires `resource::action` permission.
  ```
  The `---` separator between prose and the permission line is mandatory for
  endpoints that have both.
- `tags`: array of one or more tag names from the top-level `tags` list.
  Compute containers use `Appliance > Compute` / `Cluster > Compute`.
- `deprecated: true` on operations that are superseded by a `/v2/` equivalent.

### Response conventions
- `'200'`: always present; use `description: OK`.
  - If the backend returns no body, omit `content`.
  - If it returns JSON, use `application/json` with a `$ref` or inline schema.
- `'404'`: description must contain "not found" (lowercase) — tests assert this.
- `'422'`: description must contain "validation" (lowercase).
  Content must reference `#/components/schemas/ValidationFailed`.
- Response code keys are **quoted strings**: `'200'`, `'404'`, `'422'`.

### Schema conventions
- New schemas go in `components/schemas`.
- Use `$ref` to reuse schemas; don't duplicate inline schemas.
- Enums are string arrays; always document the meaning of each value in
  `description`.
- Include an `example` value on properties where it aids clarity.
- `required` is an array at the schema level, not per-property.

### YAML style
- 2-space indentation throughout.
- Use `|-` (literal block, strip trailing newline) for multi-line descriptions.
- Booleans: `true` / `false` (lowercase).
- Quoted strings only where YAML would misparse (e.g. `'200'`, `'404'`).
- No trailing whitespace.

---

## Tests

Tests live in `tests/*.test.js`. They use the **built-in Node.js test runner**
(`node:test`) — no Jest, no Vitest.

### Test file conventions
- ES module syntax (`import`/`export`) — `package.json` has `"type": "module"`.
- Import: `import { describe, it } from 'node:test'` and
  `import assert from 'node:assert/strict'`.
- Load the spec once at module level by parsing `index.yaml` with the `yaml`
  package.
- Use `describe` blocks per logical group (path definition, schema, responses,
  request body).
- Test names are human-readable sentences; they state what *should* be true.
- Prefer `assert.ok(condition, message)` for existence checks, `assert.equal`
  for exact matches, `assert.deepEqual` for arrays/objects.
- Guard dependent assertions: if a path might not exist, assert its existence
  first so failures are meaningful rather than throwing `TypeError`.
- Tests validate the spec against the *actual backend behaviour* — the comments
  in the existing test file (e.g. "backend returns no body", "not in backend")
  are load-bearing; keep that pattern.

### Adding a new test file
Name it `tests/<feature>.test.js`. It will be picked up automatically by
`node --test` (which globs `**/*.test.js` by default).

---

## CI

Three jobs in `.github/workflows/ci.yml`, all run on pull requests:

| Job | Tool | Command |
|-----|------|---------|
| `go-openapi` | kin-openapi | `go run .../validate -- index.yaml` |
| `redocly-lint` | Redocly CLI | `redocly lint index.yaml --format=github-actions` |
| `tests` | Node.js test runner | `npm ci && npm test` |

All three must pass before merging.

---

## Common Mistakes to Avoid

- **Inlining a path parameter that has a `$ref`** — always check
  `components/parameters` before adding an inline `in: path` definition.
- **Wrong tag** — container/compute endpoints use `Appliance > Compute` or
  `Cluster > Compute`, not the bare `Compute` tag (which is for repositories).
- **Missing `---` separator** in descriptions that have both prose and a
  permission line.
- **Unquoted response codes** — `200:` will parse as integer `200`; use `'200':`.
- **Modifying `Legacy Swagger/`** — don't touch it; it's excluded from most lint
  rules and is read-only.
