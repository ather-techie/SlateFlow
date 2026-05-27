Write a Vitest unit test file for the source file given as `$ARGUMENTS`.

## Steps

1. **Read the source file** at `$ARGUMENTS`. Identify every exported function, class method, or store action that is testable without hitting the network, DB, or filesystem. Skip anything that requires mocking Hono `Context`, `axios`, or `sqlite3` — those belong in integration tests.

2. **Detect workspace** from the path:
   - Path contains `client/` → test config is `client/vite.config.ts`, run with `npm test -w client`
   - Path contains `server/` → test config is `server/vitest.config.ts`, run with `npm test -w server`

3. **Determine test file path**: same directory as the source file, same base name, `.test.ts` extension.
   - If the test file already exists, read it first and only add missing cases — do not delete existing tests.

4. **Write the test file** following these rules:
   - Import only from `vitest`: `import { describe, it, expect, beforeEach } from 'vitest'`
   - Group tests in `describe` blocks by function/method name
   - Nested `describe` blocks for case categories: *valid inputs*, *invalid inputs / returns null*, *edge cases*
   - Every `it` label must state input → expected output (e.g. `'returns null for "0" (zero is not a valid id)'`)
   - For **Zustand stores**: reset state in `beforeEach` using `useStore.setState({ ...dataFields })` — never replace the whole state (functions would be lost). Only reset data fields, not function references.
   - For **pure functions**: no setup needed.
   - No mocks, no spies, no `vi.fn()` unless absolutely necessary and justified in a comment.
   - No `globals: true` — always import from `vitest` explicitly (server config). Client config sets `globals: true` so imports are optional on the client, but explicit imports are fine everywhere.

5. **Case coverage requirements** — for each testable unit include:
   - **Positive**: at least 2–3 valid inputs that should succeed / return a truthy value
   - **Negative**: every known invalid input that should fail / return null / false
   - **Edge**: boundary values, empty collections, coercion quirks, `null`/`undefined` user state, MAX_SAFE_INTEGER, etc.

6. **Run the tests** using the workspace command from step 2. If any test fails, fix the test file (not the source) — tests document actual behaviour, including surprising edge cases (e.g. `parseInt('1.5', 10) === 1`).

7. **Report** the test file path, number of test cases written, and the vitest output showing all tests passing.

## Patterns to reuse

**Zustand 5 reset** (client stores):
```typescript
beforeEach(() => {
  useMyStore.setState({ field1: null, field2: initialValue })
})
```

**parseId-style edge case comment** (server utils):
```typescript
it('returns 1 for "1.5" (parseInt truncates fractional part)', () => {
  // parseInt('1.5', 10) === 1
  expect(parseId('1.5')).toBe(1)
})
```

**makeX helper** for repeated object construction:
```typescript
function makeUser(overrides: Partial<MyType> = {}): MyType {
  return { id: 1, name: 'Test', ...overrides }
}
```
