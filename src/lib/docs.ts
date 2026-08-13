export type DocItem = {
  number: number;
  slug: string;
  title: string;
  shortTitle: string;
  category: "Overlays" | "Auth & Session" | "Data & Forms" | "Platform";
  problem: string;
  questions: string[];
  registryDependencies?: string[];
  dependencies?: string[];
};

export const categories = [
  "Overlays",
  "Auth & Session",
  "Data & Forms",
  "Platform",
] as const;

export const docs: DocItem[] = [
  {
    number: 1,
    slug: "modal-manager",
    title: "Global Modal Manager",
    shortTitle: "Modal manager",
    category: "Overlays",
    problem:
      "A client-only LIFO modal stack with nested Dialog / Alert Dialog primitives, typed overlay settlement, and the Overlay Layer Registry this item owns.",
    questions: [],
    registryDependencies: ["dialog", "alert-dialog"],
  },
  {
    number: 2,
    slug: "confirm-dialog",
    title: "Global Confirm Dialog with Built-in Mutation Execution",
    shortTitle: "Confirm dialog",
    category: "Overlays",
    problem:
      "The common `const confirmed = await confirm(...)` pattern still leaves the caller to manually handle loading state, error display, and success behavior after the user confirms. For simple “confirm then mutate” flows, this is repeated boilerplate.",
    questions: [
      "Should Mode B’s error state offer “Retry” in-place, or close and let the caller decide (via `onError`)?",
      "Does this depend on an external toast library, or does it need its own minimal inline success/error UI to stay decoupled?",
      "How does this compose with #5 (async action wrapper) — is `confirmAndRun` just `confirm()` + the action-runner underneath?",
    ],
    registryDependencies: ["alert-dialog"],
  },
  {
    number: 3,
    slug: "alert-prompt-dialog",
    title: "Global Alert / Prompt Dialog",
    shortTitle: "Alert / prompt",
    category: "Overlays",
    problem:
      "`window.alert` / `window.prompt` are unstyled and block the JS thread; teams rebuild styled equivalents repeatedly.",
    questions: [
      "Is this just a mode of the Modal Manager (#1) with a fixed layout, or a fully separate registry item?",
      "Do we need multi-field prompts, or strictly single-input?",
    ],
    registryDependencies: ["dialog", "input"],
  },
  {
    number: 4,
    slug: "loading-overlay",
    title: "Global Loading Overlay with States",
    shortTitle: "Loading overlay",
    category: "Overlays",
    problem:
      "Full-page or scoped loading indicators are re-implemented per feature, with inconsistent success/error handling.",
    questions: [
      "Should success/error states auto-dismiss, or require explicit `reset()`?",
      "Does this overlay show progress (percentage) for long operations, or is it strictly indeterminate?",
    ],
    registryDependencies: ["alert"],
  },
  {
    number: 5,
    slug: "action-runner",
    title: "Async Action Wrapper (“Action Runner”)",
    shortTitle: "Action runner",
    category: "Overlays",
    problem:
      "Every call site that fires a mutation hand-writes try/catch + loading state + toast/error display.",
    questions: [
      "Does this become the single canonical way mutations are fired in the app, or an opt-in convenience for simple cases only?",
      "Concurrency: what happens if `run()` is called again while a previous call on the same scope is still in flight — queue, ignore, or cancel-and-replace?",
      "Given Next.js’s built-in `useActionState`/`useFormStatus`, does this item risk duplicating framework-provided functionality?",
    ],
    dependencies: ["motion"],
  },
  {
    number: 6,
    slug: "sheet-manager",
    title: "Drawer / Sheet Manager",
    shortTitle: "Sheet manager",
    category: "Overlays",
    problem:
      "Slide-in panels have different stacking/animation/dismissal rules than modals (e.g. swipe-to-dismiss on mobile) but are often hacked on top of the modal system.",
    questions: [
      "Should Drawer Manager and Modal Manager share a single stack (so a modal opened from a drawer stacks correctly), or stay fully independent?",
      "Given the overlap with #1, should this and #1 be specified together as one “Overlay Manager” registry item with a `type: dialog | sheet` parameter, rather than two separate items?",
    ],
    registryDependencies: ["sheet"],
  },
  {
    number: 7,
    slug: "command-palette",
    title: "Command Palette (Cmd+K)",
    shortTitle: "Command palette",
    category: "Overlays",
    problem:
      "Power-user navigation/actions are either absent or bolted on late, requiring a registry of everything the app can do.",
    questions: [
      "Should commands support async actions (e.g. “navigate after fetching something”), or are they strictly synchronous triggers?",
      "Permission-awareness: does a command hide itself if the user lacks access, or show disabled with a tooltip?",
    ],
    registryDependencies: ["command", "dialog"],
  },
  {
    number: 8,
    slug: "authentication-core",
    title: "Authentication Core (Session + Token Adapter)",
    shortTitle: "Authentication core",
    category: "Auth & Session",
    problem:
      "Auth needs to work across two very different runtime contexts — client-only SPA, and Next.js SSR/RSC/middleware — and two different backend models: opaque server-managed sessions (cookie-based) and stateless access/refresh token pairs.",
    questions: [
      "Does this wrap a specific library as a hard dependency (Auth.js is the most natural default for the session-cookie strategy on Next.js) or stay library-agnostic with Auth.js as only the reference implementation?",
      "For the token strategy: is the SPA assumed same-origin with the API or cross-origin, and is a cross-origin cookie-based refresh token acceptable?",
      "Should #11 (Session Expiry/Silent Refresh) be merged into this item?",
      "What does `signIn` return/throw on validation vs. network vs. account-locked type errors — does this need to compose with #13’s error classification from day one?",
    ],
    dependencies: [],
  },
  {
    number: 9,
    slug: "pending-auth-action",
    title: "Pending-Action-After-Auth (Redirect + Mutation Replay)",
    shortTitle: "Pending auth action",
    category: "Auth & Session",
    problem:
      "Already designed in depth in a prior session — included here for completeness and to formalize as part of this infra set.",
    questions: [
      "Single-intent slot vs. array of queued intents — worth deciding now given the rest of this list?",
      "Should replay integrate with #5 (Action Runner) so replay failures get the same toast/error treatment as any other mutation?",
    ],
    dependencies: ["@tanstack/react-query"],
  },
  {
    number: 10,
    slug: "auth-guard",
    title: "Auth-Required Route/Action Guard",
    shortTitle: "Auth guard",
    category: "Auth & Session",
    problem:
      "`if (!isAuthenticated) { ...redirect... }` is hand-written at every call site that needs auth.",
    questions: [
      "Does `withAuth` need to know whether the wrapped function is “resumable” as a mutation intent, or is that the caller’s responsibility?",
      "Should there be a variant that shows an inline “sign in to continue” prompt instead of a hard redirect?",
    ],
  },
  {
    number: 11,
    slug: "session-refresh",
    title: "Session Expiry / Silent Refresh Handling",
    shortTitle: "Session refresh",
    category: "Auth & Session",
    problem:
      "A 401 mid-session currently surfaces as a raw failed request instead of being transparently recovered.",
    questions: [
      "Should GET requests be auto-replayed but mutations require explicit user re-confirmation?",
      "How is this tested/mocked reliably given the timing-sensitive queueing behavior?",
      "Given the client/server split, is this even a single registry item, or two?",
      "As raised in #8: should this item just be merged into #8 outright?",
    ],
  },
  {
    number: 12,
    slug: "optimistic-mutation",
    title: "Optimistic Mutation Helper",
    shortTitle: "Optimistic mutation",
    category: "Data & Forms",
    problem:
      "Optimistic update + rollback-on-error is rewritten per-entity on top of React Query.",
    questions: [
      "Generic enough to cover list insert/remove/update, or does that need three separate helper variants?",
      "Should this explicitly declare React Query as a hard dependency (registry `dependencies` field)?",
    ],
    dependencies: ["@tanstack/react-query"],
  },
  {
    number: 13,
    slug: "error-classification",
    title: "Error Classification",
    shortTitle: "Error classification",
    category: "Data & Forms",
    problem:
      "Errors (network, validation, server, auth) all get treated the same, when they should route to different UI treatments. This item owns the shared ErrorClassification model and a UI-neutral classifyError helper so every other item can branch on one taxonomy.",
    questions: [],
  },
  {
    number: 14,
    slug: "draft-autosave",
    title: "Form Persistence / Draft Autosave",
    shortTitle: "Draft autosave",
    category: "Data & Forms",
    problem:
      "Long forms lose data on accidental navigation/refresh; also composable with #9 (“save draft, redirect to login, restore after”).",
    questions: [
      "Should this integrate directly with #9’s intent system, or stay fully separate since drafts are restored rather than replayed?",
    ],
  },
  {
    number: 15,
    slug: "unsaved-changes",
    title: "Unsaved-Changes Guard",
    shortTitle: "Unsaved changes",
    category: "Data & Forms",
    problem:
      "Users lose in-progress edits by navigating away or closing the tab without warning.",
    questions: [
      "Given the framework gap above, should this ship with a documented limitation (“only reliably blocks `beforeunload` in Next.js; in-app nav blocking is best-effort”), or is a more involved solution in scope?",
    ],
    registryDependencies: ["alert-dialog"],
  },
  {
    number: 16,
    slug: "feature-flags",
    title: "Feature Flag Provider",
    shortTitle: "Feature flags",
    category: "Platform",
    problem:
      "An adapter-first flag provider with schema-declared boolean and variant values, bootstrap snapshots, explicit refresh, and a server-only module so server-only flags never reach the client.",
    questions: [],
    dependencies: ["server-only"],
  },
  {
    number: 17,
    slug: "keyboard-shortcuts",
    title: "Global Keyboard Shortcut Registry",
    shortTitle: "Keyboard shortcuts",
    category: "Platform",
    problem:
      "A client-only shortcut registry that normalizes single-chord shortcuts, tracks registrations in named shortcut scopes, and dispatches with deterministic conflict and priority rules.",
    questions: [],
  },
  {
    number: 18,
    slug: "offline-banner",
    title: "Online/Offline Detection Banner",
    shortTitle: "Offline detection",
    category: "Platform",
    problem:
      "A connectivity snapshot (`unknown` | `online` | `offline`) plus an accessible, non-blocking banner. Status chrome, not an overlay layer, with an optional consumer-supplied reachability probe and no mutation queue.",
    questions: [],
    registryDependencies: ["alert"],
  },
  {
    number: 19,
    slug: "idle-timeout",
    title: "Idle / Session-Timeout Detector",
    shortTitle: "Idle timeout",
    category: "Platform",
    problem:
      "No generic way to detect user inactivity and log out for compliance-sensitive apps.",
    questions: [
      "Should idle tracking pause when the tab is backgrounded (visibility API), or count backgrounded time toward the timeout?",
    ],
    registryDependencies: ["alert-dialog"],
  },
  {
    number: 20,
    slug: "error-reporting",
    title: "Error Reporting Boundary with User Feedback",
    shortTitle: "Error reporting",
    category: "Platform",
    problem:
      "Render-time crashes show a blank/broken UI with no path for the user to report what happened, and no automatic capture for the team.",
    questions: [
      "Relationship to #13 (typed error classification) — does this boundary only handle render errors, while #13’s classification handles async/mutation errors, with no overlap?",
    ],
    registryDependencies: ["dialog", "textarea"],
  },
];

export function getDoc(slug: string) {
  return docs.find((doc) => doc.slug === slug);
}
