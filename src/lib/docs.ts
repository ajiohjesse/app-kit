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
    title: "Global Confirm Dialog",
    shortTitle: "Confirm dialog",
    category: "Overlays",
    problem:
      "An Alert Dialog workflow on modal-manager with ErrorClassification errors, so confirm-and-run does not invent a second overlay layer or error model.",
    questions: [],
    registryDependencies: [
      "@app-kit/modal-manager",
      "@app-kit/error-classification",
    ],
  },
  {
    number: 3,
    slug: "alert-prompt-dialog",
    title: "Global Alert / Prompt Dialog",
    shortTitle: "Alert / prompt",
    category: "Overlays",
    problem:
      "Accessible window.alert / window.prompt replacements: alert on the alert-dialog surface and a single-input prompt on the dialog surface, both hosted on modal-manager.",
    questions: [],
    registryDependencies: ["@app-kit/modal-manager", "input"],
  },
  {
    number: 4,
    slug: "loading-overlay",
    title: "Global Loading Overlay with States",
    shortTitle: "Loading overlay",
    category: "Overlays",
    problem:
      "Per-token pending/succeeded/failed/released ownership with fail-wins aggregate reduction, named scopes, and optional overlay-layer registration when blocking.",
    questions: [],
  },
  {
    number: 5,
    slug: "action-runner",
    title: "Async Action Wrapper (“Action Runner”)",
    shortTitle: "Action runner",
    category: "Overlays",
    problem:
      "Scoped typed async lifecycles with optional confirm and the exact loading-overlay token lifecycle, without prescribing a toast or motion library.",
    questions: [],
    registryDependencies: ["@app-kit/error-classification"],
  },
  {
    number: 6,
    slug: "sheet-manager",
    title: "Drawer / Sheet Manager",
    shortTitle: "Sheet manager",
    category: "Overlays",
    problem:
      "Client-only LIFO sheet stack, separate from modal-manager, with SheetSettlement, side policies, pending dismissal locks, and overlay-layer registration so a sheet can open over a modal without mutating it.",
    questions: [],
    registryDependencies: ["@app-kit/modal-manager", "sheet"],
  },
  {
    number: 7,
    slug: "command-palette",
    title: "Command Palette (Cmd+K)",
    shortTitle: "Command palette",
    category: "Overlays",
    problem:
      "Searchable command surface hosted as a modal-manager dialog containing Command — not a second dialog root. Destructive commands fail closed without confirm. Local embeds work without the overlay registry.",
    questions: [],
    registryDependencies: [
      "@app-kit/modal-manager",
      "@app-kit/error-classification",
      "@app-kit/keyboard-shortcuts",
      "command",
    ],
  },
  {
    number: 8,
    slug: "authentication-core",
    title: "Authentication Core",
    shortTitle: "Authentication core",
    category: "Auth & Session",
    problem:
      "A session-centric, adapter-first core with AuthUser, Session, and a UX-only session seed so consumers can plug their auth system without a vendor SDK.",
    questions: [],
    registryDependencies: ["@app-kit/error-classification"],
    dependencies: ["server-only"],
  },
  {
    number: 9,
    slug: "pending-auth-action",
    title: "Pending-Action-After-Auth (Redirect + Mutation Replay)",
    shortTitle: "Pending auth action",
    category: "Auth & Session",
    problem:
      "Resume a typed, user-bound action after authentication with a tab-local store and bounded claim/navigate/dispatch — without serializing functions or pulling a data library.",
    questions: [],
    registryDependencies: [
      "@app-kit/authentication-core",
      "@app-kit/error-classification",
    ],
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
      "Opt-in client refresh coordinator on authentication-core refresh(): single-flight sharing, ReplayPolicy-governed request replay, and 401 recovery without inventing unsupported refresh.",
    questions: [],
    registryDependencies: ["@app-kit/authentication-core"],
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
      "Long forms lose data on accidental navigation/refresh; drafts stay separate from pending-auth-action intents and restore explicitly after auth.",
    questions: [],
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
      "Adapter-first reporting after classification: redacted ErrorReport delivery through a consumer adapter, opt-in consent, and recovery that never waits on the report. Feedback UI stays consumer-owned.",
    questions: [],
    registryDependencies: ["@app-kit/error-classification"],
  },
];

export function getDoc(slug: string) {
  return docs.find((doc) => doc.slug === slug);
}
