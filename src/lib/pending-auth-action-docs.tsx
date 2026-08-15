import type { CompleteDocSlots } from "./complete-docs";
import { PendingAuthActionPreview } from "./pending-auth-action-preview";

const registerExample = `"use client";

import {
  PendingActionHandlerRegistration,
  PendingAuthActionProvider,
  usePendingAuthAction,
} from "@/components/pending-auth-action-provider";

export function SaveDraftButton() {
  const { registerIntent } = usePendingAuthAction();

  return (
    <>
      <PendingActionHandlerRegistration
        kind="save-draft"
        handler={async ({ intent, session, idempotencyKey }) => {
          await saveDraft(intent.payload, session.user.id, idempotencyKey);
          return { status: "succeeded" };
        }}
      />
      <button
        type="button"
        onClick={() =>
          void registerIntent({
            kind: "save-draft",
            version: 1,
            payload: { draftId: "draft-1" },
            returnTo: "/drafts/draft-1",
            idempotencyKey: "save-draft-1",
            replayPolicy: "mutation",
          })
        }
      >
        Save after sign-in
      </button>
    </>
  );
}

async function saveDraft(
  _payload: unknown,
  _userId: string,
  _idempotencyKey: string
) {
  // consumer-owned mutation with its own idempotency strategy
}
`;

const resumeExample = `"use client";

import { useEffect, useState } from "react";
import { usePendingAuthAction } from "@/components/pending-auth-action-provider";
import type { ResumeResult } from "@/lib/pending-auth-action";

export function ResumeAfterAuth({ intentId }: { intentId: string }) {
  const { resume } = usePendingAuthAction();
  const [result, setResult] = useState<ResumeResult | null>(null);

  useEffect(() => {
    void resume({ intentId }).then(setResult);
  }, [intentId, resume]);

  if (!result) return <p>Resuming…</p>;
  return <p>{result.status}</p>;
}
`;

const failClosedExample = `"use client";

import { usePendingAuthAction } from "@/components/pending-auth-action-provider";

export async function resumeOrExplain(intentId: string) {
  const { resume } = usePendingAuthAction();
  const result = await resume({ intentId });

  switch (result.status) {
    case "missing-handler":
      return "No handler registered for this intent kind.";
    case "user-mismatch":
      return "This pending action belongs to a different user.";
    case "mutation-replay-disabled":
      return "Mutation replay is opt-in; enable allowMutationReplay.";
    case "expired":
    case "consumed":
    case "navigation-failed":
      return result.status;
    default:
      return result.status;
  }
}
`;

const providerExample = `"use client";

import { AuthProvider, useSession } from "@/components/authentication-core-provider";
import { PendingAuthActionProvider } from "@/components/pending-auth-action-provider";
import { spaAdapter } from "./spa-adapter";

export function App() {
  return (
    <AuthProvider adapter={spaAdapter}>
      <PendingAuthBridge />
    </AuthProvider>
  );
}

function PendingAuthBridge({ children }: { children?: React.ReactNode }) {
  const auth = useSession();
  return (
    <PendingAuthActionProvider
      getSession={async () =>
        auth.status === "authenticated" ? auth.session : null
      }
      navigate={(to) => {
        window.location.assign(to);
      }}
      allowMutationReplay={false}
      fallbackReturnTo="/"
    >
      {children}
    </PendingAuthActionProvider>
  );
}
`;

const spaRecipe = `"use client";

import { PendingAuthActionProvider } from "@/components/pending-auth-action-provider";
import type { Session } from "@/lib/authentication-core";

let session: Session | null = null;

export function SpaRoot({ children }: { children: React.ReactNode }) {
  return (
    <PendingAuthActionProvider
      getSession={async () => session}
      navigate={(to) => {
        window.history.pushState({}, "", to);
      }}
    >
      {children}
    </PendingAuthActionProvider>
  );
}
`;

const nextRecipe = `"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/components/authentication-core-provider";
import { PendingAuthActionProvider } from "@/components/pending-auth-action-provider";

export function PendingAuthProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const auth = useSession();

  return (
    <PendingAuthActionProvider
      getSession={async () =>
        auth.status === "authenticated" ? auth.session : null
      }
      navigate={(to) => {
        router.replace(to);
      }}
    >
      {children}
    </PendingAuthActionProvider>
  );
}
`;

export const pendingAuthActionDocs: CompleteDocSlots = {
  preview: <PendingAuthActionPreview />,
  examples: [
    { label: "provider.tsx", language: "tsx", code: providerExample },
    { label: "register-intent.tsx", language: "tsx", code: registerExample },
    { label: "resume.tsx", language: "tsx", code: resumeExample },
    { label: "fail-closed.tsx", language: "tsx", code: failClosedExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "providers.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">PendingActionIntent</dt>
      <dd>
        Serializable intent: <code>id</code>, <code>kind</code>,{" "}
        <code>version</code>, JSON <code>payload</code>, same-origin{" "}
        <code>returnTo</code>, <code>createdAt</code>, <code>expiresAt</code>,{" "}
        <code>idempotencyKey</code>,{" "}
        <code>replayPolicy: &quot;read&quot; | &quot;mutation&quot;</code>,
        optional <code>userId</code>. Handlers are never serialized.
      </dd>
      <dt className="mono">createPendingActionIntent(input)</dt>
      <dd>
        Validates kind/version/payload, rejects non-JSON values and oversized
        payloads, and stamps created/expiry timestamps.
      </dd>
      <dt className="mono">PendingActionStore</dt>
      <dd>
        Injected persistence: <code>save</code>, <code>read</code>, atomic{" "}
        <code>claim</code>, <code>remove</code>. Default browser store is{" "}
        <code>createSessionStoragePendingActionStore()</code> (tab-local).
      </dd>
      <dt className="mono">createPendingActionHandlerRegistry()</dt>
      <dd>
        Runtime <code>register(kind, handler)</code> / <code>get</code> /{" "}
        <code>clear</code>. Unregister on dispose; provider clears on unmount.
      </dd>
      <dt className="mono">createResumeOperation(options)</dt>
      <dd>
        Bounded resume: session → validate → user bind → claim → navigate →
        dispatch. Settles once per intent id. Outcomes include{" "}
        <code>missing-handler</code>, <code>user-mismatch</code>,{" "}
        <code>mutation-replay-disabled</code>, <code>navigation-failed</code>,{" "}
        <code>expired</code>, <code>consumed</code>, and handler
        success/failure.
      </dd>
      <dt className="mono">
        PendingAuthActionProvider / usePendingAuthAction()
      </dt>
      <dd>
        Client provider wiring store, handlers, <code>registerIntent</code>,{" "}
        <code>registerHandler</code>, and <code>resume</code>. Requires injected{" "}
        <code>getSession</code> and <code>navigate</code>.{" "}
        <code>allowMutationReplay</code> defaults to <code>false</code>.
      </dd>
      <dt className="mono">PendingActionHandlerRegistration</dt>
      <dd>
        Effect-based handler registration helper for a single <code>kind</code>.
      </dd>
    </dl>
  ),
  limitations: [
    "Default store is sessionStorage (tab-local). Cross-tab or durable storage requires an explicit shared PendingActionStore.",
    "Mutation intents never replay unless allowMutationReplay is true and the consumer owns authorization plus idempotency.",
    "action-runner composition is optional and injected by the consumer; this item does not declare it as a registry dependency.",
    "No TanStack Query peer. Import AuthUser / Session / ReplayPolicy from @app-kit/authentication-core.",
    "Manual-copy fallback: copy pending-auth-action.ts to src/lib/pending-auth-action.ts and pending-auth-action-provider.tsx to src/components/pending-auth-action-provider.tsx. Add @app-kit/authentication-core and @app-kit/error-classification registry dependencies.",
  ],
};
