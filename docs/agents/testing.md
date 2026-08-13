# Verification harness

App Kit uses two test layers plus two clean-consumer fixtures.

- **Unit/component tests** run with Vitest, React Testing Library, and jsdom. Use these for pure logic, hooks, state transitions, accessibility semantics, and component behavior without a browser.
- **End-to-end tests** run with Playwright. Use these for routing, server/client integration, nested overlays and focus, auth no-flash, Next.js error recovery, keyboard and pointer flows, and installed consumer fixtures.

Commands:

```bash
bun run typecheck
bun run test:unit
bun run test:e2e
```

`test:e2e` starts the local Next.js development server automatically and uses an installed Google Chrome channel. On machines without Chrome, install a Playwright browser with `bunx playwright install chromium` and change the project channel to the installed browser.

## Fixtures

Harness completion (ticket 03) adds:

- `fixtures/next-app-router` — clean Next.js 16.3 App Router + Base UI consumer
- `fixtures/spa-vite` — client-only Vite + React 19 consumer

Both register `@app-kit` against this repo's `public/r/{name}.json`. Registry-item acceptance must run `bun run registry:build`, then dry-run and real `bunx shadcn@latest add @app-kit/<item>`, then assert targets, rewritten imports, qualified internal deps, and that client graphs do not import `*.server.ts`.

`bun run registry:verify -- <item>` runs that matrix against temporary copies of both fixtures, so an install check never changes the committed fixture baselines. The Playwright registry smoke uses `modal-manager` only to exercise the distribution plumbing; its placeholder metadata is not accepted as a completed item contract.

Playwright has three projects: `chrome` for the docs application, `next-fixture` for the clean Next App Router consumer, and `spa-fixture` for the clean Vite consumer. Item-specific browser acceptance belongs in the matching project when it crosses a framework boundary.

## Network and time

Keep adapter unit tests on injected fakes. Use MSW 2.x when a test must observe `fetch` (session refresh interception, reachability probes, flag refresh). Use the shared fake-clock helper for debounce, idle, refresh leeway, and overlay auto-reset. Do not use real wall-clock sleeps for those contracts.

`src/test-utils/fake-clock.ts` is the timer injection for race tests. `src/test-utils/fixtures.ts` supplies deterministic session-seed and overlay state fixtures; they are test utilities, not registry items.

## Next.js 16.3 error recovery

In `error.tsx` / `global-error.tsx` recipes and Playwright:

- `retry()` re-fetches then re-renders (primary recovery)
- `reset()` re-renders without refetching

The installed `next@16.3.0` error boundary types expose both `retry` and `reset`.

Registry-item contracts prefer focused unit/component acceptance tests and add an end-to-end test when the acceptance criterion crosses a route, browser API, framework boundary, overlay composition, or consumer-visible install flow.

`registry.json` and `src/lib/docs.ts` are placeholders until implementation tickets rewrite them; do not treat their current dependencies as the contract.
