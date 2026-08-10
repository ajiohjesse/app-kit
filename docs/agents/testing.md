# Verification harness

App Kit uses two test layers:

- **Unit/component tests** run with Vitest, React Testing Library, and jsdom. Use these for pure logic, hooks, state transitions, accessibility semantics, and component behavior without a browser.
- **End-to-end tests** run with Playwright against the Next.js app. Use these for routing, server/client integration, generated registry pages, keyboard and pointer flows, and behavior that depends on a real browser.

Commands:

```bash
bun run typecheck
bun run test:unit
bun run test:e2e
```

`test:e2e` starts the local Next.js development server automatically and uses an installed Google Chrome channel. On machines without Chrome, install a Playwright browser with `bunx playwright install chromium` and change the project channel to the installed browser.

Registry-item contracts should prefer focused unit/component acceptance tests and add an end-to-end test when the acceptance criterion crosses a route, browser API, framework boundary, or consumer-visible install flow. Keep network/auth tests mocked at the boundary; add MSW only when the first contract needs request-level mocking.
