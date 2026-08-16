import type { CompleteDocSlots } from "./complete-docs";
import { AuthGuardPreview } from "./auth-guard-preview";

const redirectWithoutResumeExample = `"use client";

import { AuthGuard } from "@/components/auth-guard-boundary";
import { useRouter } from "next/navigation";

export function BillingPage() {
  const router = useRouter();

  return (
    <AuthGuard
      policy="redirect-without-resume"
      signInTo="/sign-in"
      navigate={(to) => {
        router.replace(to);
      }}
      loading={<p>Checking session…</p>}
    >
      <BillingSettings />
    </AuthGuard>
  );
}

function BillingSettings() {
  return <p>Billing settings</p>;
}
`;

const redirectAndResumeExample = `"use client";

import { AuthGuard, withAuthGuard } from "@/components/auth-guard-boundary";
import { usePendingAuthAction } from "@/components/pending-auth-action-provider";
import { useSession } from "@/components/authentication-core-provider";

export function SaveDraftButton() {
  const auth = useSession();
  const { registerIntent } = usePendingAuthAction();

  const save = withAuthGuard(
    async (input: { draftId: string }, { session }) => {
      await persistDraft(input.draftId, session.user.id);
      return "saved";
    },
    {
      readSession: async () => {
        // Live re-check — do not authorize from seed alone.
        const live = await fetch("/api/session").then((r) => r.json());
        return live;
      },
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate: (to) => {
        window.location.assign(to);
      },
      registerPendingIntent: async (intent) => {
        const saved = await registerIntent(intent);
        return { id: saved.id };
      },
      pendingIntent: (input) => ({
        kind: "save-draft",
        version: 1,
        payload: input,
        idempotencyKey: \`save-\${input.draftId}\`,
        replayPolicy: "mutation",
        returnTo: \`/drafts/\${input.draftId}\`,
      }),
    }
  );

  return (
    <button type="button" onClick={() => void save({ draftId: "draft-1" })}>
      Save draft
    </button>
  );
}

async function persistDraft(_draftId: string, _userId: string) {}
`;

const inlineExample = `"use client";

import { AuthGuard } from "@/components/auth-guard-boundary";

export function AccountPanel() {
  return (
    <AuthGuard
      policy="inline"
      loading={<p>Loading…</p>}
      fallback={<SignInPrompt />}
    >
      <AccountDetails />
    </AuthGuard>
  );
}

function SignInPrompt() {
  return <p>Sign in to continue</p>;
}

function AccountDetails() {
  return <p>Account details</p>;
}
`;

const guardedActionExample = `"use client";

import { withAuthGuard } from "@/components/auth-guard-boundary";
import type { AuthSnapshot } from "@/lib/authentication-core";

export function createSaveAction(readSession: () => Promise<AuthSnapshot>) {
  return withAuthGuard(
    async (input: { title: string }, { session }) => {
      return { id: "doc-1", title: input.title, ownerId: session.user.id };
    },
    {
      readSession,
      policy: "inline",
      authorize: (session) => session.user.id !== "banned",
    }
  );
}
`;

const failClosedExample = `"use client";

import { withAuthGuard } from "@/components/auth-guard-boundary";
import type { AuthSnapshot } from "@/lib/authentication-core";

const unauthenticated: AuthSnapshot = {
  status: "unauthenticated",
  session: null,
  user: null,
  reason: "missing",
};

export async function tryResumeWithoutPending() {
  const guarded = withAuthGuard(async () => "ok", {
    readSession: async () => unauthenticated,
    policy: "redirect-and-resume",
    signInTo: "/sign-in",
    // registerPendingIntent intentionally omitted
    pendingIntent: {
      kind: "open",
      version: 1,
      payload: {},
      idempotencyKey: "open-1",
      replayPolicy: "read",
      returnTo: "/app",
    },
  });

  const result = await guarded({});
  // { status: "resume-unavailable" } — no navigate, no silent drop
  return result;
}
`;

const spaRecipe = `"use client";

import { AuthProvider } from "@/components/authentication-core-provider";
import { AuthGuard } from "@/components/auth-guard-boundary";
import type { AuthenticationAdapter } from "@/lib/authentication-core";

export function SpaApp({
  adapter,
}: {
  adapter: AuthenticationAdapter;
}) {
  return (
    <AuthProvider adapter={adapter}>
      <AuthGuard
        policy="redirect-without-resume"
        signInTo="/sign-in"
        navigate={(to) => {
          window.history.pushState({}, "", to);
        }}
        loading={<p>Loading session…</p>}
      >
        <Dashboard />
      </AuthGuard>
    </AuthProvider>
  );
}

function Dashboard() {
  return <h1>Dashboard</h1>;
}
`;

const nextRecipe = `"use client";

import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard-boundary";

export function ProtectedSettings({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <AuthGuard
      policy="redirect-without-resume"
      signInTo="/sign-in"
      navigate={(to) => {
        router.replace(to);
      }}
      loading={<p>Checking session…</p>}
    >
      {children}
    </AuthGuard>
  );
}
`;

const seedUxOnlyExample = `"use client";

import { withAuthGuard } from "@/components/auth-guard-boundary";
import type { AuthenticationAdapter, AuthSnapshot } from "@/lib/authentication-core";

export function createGuardedMutation(adapter: AuthenticationAdapter) {
  return withAuthGuard(
    async (_input: unknown, { session }) => {
      await saveSensitive(session.user.id);
      return "saved";
    },
    {
      // Prefer adapter.getSession over a seed snapshot for mutations.
      readSession: async (): Promise<AuthSnapshot> => {
        const session = await adapter.getSession();
        if (!session) {
          return {
            status: "unauthenticated",
            session: null,
            user: null,
            reason: "missing",
          };
        }
        return { status: "authenticated", session, user: session.user };
      },
      policy: "inline",
    }
  );
}

async function saveSensitive(_userId: string) {}
`;

export const authGuardDocs: CompleteDocSlots = {
  preview: <AuthGuardPreview />,
  examples: [
    {
      label: "redirect-without-resume.tsx",
      language: "tsx",
      code: redirectWithoutResumeExample,
    },
    {
      label: "redirect-and-resume.tsx",
      language: "tsx",
      code: redirectAndResumeExample,
    },
    { label: "inline.tsx", language: "tsx", code: inlineExample },
    {
      label: "guarded-action.tsx",
      language: "tsx",
      code: guardedActionExample,
    },
    {
      label: "fail-closed-resume.tsx",
      language: "tsx",
      code: failClosedExample,
    },
    {
      label: "seed-ux-only.tsx",
      language: "tsx",
      code: seedUxOnlyExample,
    },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "protected-settings.tsx", language: "tsx", code: nextRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">UnauthenticatedPolicy</dt>
      <dd>
        Owned by this item:{" "}
        <code>
          &quot;redirect-without-resume&quot; | &quot;redirect-and-resume&quot;
          | &quot;inline&quot;
        </code>
        . Required at each guard site — no implicit default.
      </dd>
      <dt className="mono">withAuthGuard(action, options)</dt>
      <dd>
        Typed action wrapper. Inject <code>readSession</code>, explicit{" "}
        <code>policy</code>, optional <code>authorize</code>, and policy wiring
        (<code>navigate</code>, <code>registerPendingIntent</code>,{" "}
        <code>pendingIntent</code>). Re-checks the live session immediately
        before execution. Seed snapshots must not authorize mutations.
      </dd>
      <dt className="mono">requireSession(options)</dt>
      <dd>
        Framework-neutral route/session predicate. Returns authenticated session
        or typed unauthenticated outcomes including{" "}
        <code>resume-unavailable</code>.
      </dd>
      <dt className="mono">AuthGuard</dt>
      <dd>
        Client route boundary over <code>useSession()</code>. Withholds children
        while loading; applies the explicit policy when unauthenticated.
      </dd>
      <dt className="mono">useGuardedAction(action, options)</dt>
      <dd>
        Hook that binds <code>withAuthGuard</code>. Requires an explicit live{" "}
        <code>readSession</code> (do not authorize mutations from a session seed
        alone).
      </dd>
      <dt className="mono">normalizeRedirectTarget / isSafeRedirectTarget</dt>
      <dd>
        Same-origin path/query normalization. Rejects absolute foreign URLs,
        protocol-relative targets, and unsafe schemes.
      </dd>
      <dt className="mono">createInlineContinuation(options)</dt>
      <dd>
        Runtime-only continuation: one auth transition, expiry-bounded,
        identity-bound, never persisted. Settles once.
      </dd>
    </dl>
  ),
  limitations: [
    "Unauthenticated policy is required at every guard site. There is no default redirect.",
    "redirect-and-resume fails closed with resume-unavailable when registerPendingIntent is missing. Install @app-kit/pending-auth-action separately; it is not a hard registry dependency of auth-guard.",
    "Session seed is UX-only. Guarded mutations must re-check the live session via readSession (typically adapter.getSession).",
    "Import Session / AuthSnapshot / ReplayPolicy from @app-kit/authentication-core. This item owns UnauthenticatedPolicy only.",
    "Manual-copy fallback: copy auth-guard.ts to src/lib/auth-guard.ts and auth-guard-boundary.tsx to src/components/auth-guard-boundary.tsx. Add @app-kit/authentication-core and @app-kit/error-classification registry dependencies.",
  ],
};
