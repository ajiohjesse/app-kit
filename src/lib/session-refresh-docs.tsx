import type { CompleteDocSlots } from "./complete-docs";
import { SessionRefreshPreview } from "./session-refresh-preview";

const coordinatorExample = `"use client";

import { AuthProvider, useAuth } from "@/components/authentication-core-provider";
import {
  SessionRefreshProvider,
  useSessionRefresh,
} from "@/components/session-refresh-provider";
import { spaAdapter } from "./spa-adapter";

export function App({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider adapter={spaAdapter}>
      <SessionRefreshBridge>{children}</SessionRefreshBridge>
    </AuthProvider>
  );
}

function SessionRefreshBridge({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <SessionRefreshProvider
      refresh={(input) => auth.refresh(input)}
      session={auth.status === "authenticated" ? auth.session : null}
      onSession={(session) => {
        // consumer policy: update auth core / sign out on expired
        void session;
      }}
    >
      {children}
    </SessionRefreshProvider>
  );
}

export function SilentRefreshButton() {
  const { refresh } = useSessionRefresh();
  return (
    <button type="button" onClick={() => void refresh()}>
      Refresh session
    </button>
  );
}
`;

const replayPolicyExample = `"use client";

import { useSessionRefresh } from "@/components/session-refresh-provider";
import { AuthExpiredError } from "@/lib/session-refresh";

export function InvoiceActions({ id }: { id: string }) {
  const { intercept } = useSessionRefresh();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          void intercept(
            async ({ signal }) => {
              const response = await fetch(\`/api/invoices/\${id}\`, { signal });
              if (response.status === 401) throw new AuthExpiredError();
              return response.json();
            },
            { replayPolicy: "read" }
          )
        }
      >
        Load
      </button>
      <button
        type="button"
        onClick={() =>
          void intercept(
            async ({ signal }) => {
              const response = await fetch(\`/api/invoices/\${id}\`, {
                method: "POST",
                signal,
                body: JSON.stringify({ id }),
              });
              if (response.status === 401) throw new AuthExpiredError();
              return response.json();
            },
            {
              replayPolicy: "mutation",
              acknowledgeMutationReplay: true,
              idempotencyKey: \`save-invoice-\${id}\`,
            }
          )
        }
      >
        Save
      </button>
    </>
  );
}
`;

const recoveryExample = `"use client";

import {
  createFetchInterceptor,
  createRefreshCoordinator,
} from "@/lib/session-refresh";

const coordinator = createRefreshCoordinator({
  refresh: async ({ signal } = {}) => {
    const response = await fetch("/api/session/refresh", { signal });
    if (!response.ok) return null;
    return response.json();
  },
});

// 401 → one shared refresh → replay once for reads
export const apiFetch = createFetchInterceptor({
  coordinator,
  replayPolicy: "read",
});
`;

const spaRecipe = `"use client";

import { SessionRefreshProvider } from "@/components/session-refresh-provider";
import type { Session } from "@/lib/authentication-core";

let session: Session | null = null;

export function SpaRoot({ children }: { children: React.ReactNode }) {
  return (
    <SessionRefreshProvider
      getSession={() => session}
      refresh={async () => {
        const response = await fetch("/api/session/refresh");
        if (!response.ok) return null;
        session = await response.json();
        return session;
      }}
    >
      {children}
    </SessionRefreshProvider>
  );
}
`;

const nextRecipe = `"use client";

import { useAuth } from "@/components/authentication-core-provider";
import { SessionRefreshProvider } from "@/components/session-refresh-provider";

export function SessionRefreshProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();

  return (
    <SessionRefreshProvider
      refresh={(input) => auth.refresh(input)}
      session={auth.status === "authenticated" ? auth.session : null}
      refreshOnVisible={false}
      refreshOnFocus={false}
    >
      {children}
    </SessionRefreshProvider>
  );
}
`;

export const sessionRefreshDocs: CompleteDocSlots = {
  preview: <SessionRefreshPreview />,
  examples: [
    { label: "coordinator.tsx", language: "tsx", code: coordinatorExample },
    { label: "replay-policy.tsx", language: "tsx", code: replayPolicyExample },
    { label: "401-recovery.tsx", language: "tsx", code: recoveryExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "providers.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">createRefreshCoordinator(options)</dt>
      <dd>
        Client coordinator: single-flight <code>refresh()</code>,
        transport-neutral <code>intercept()</code>, generation{" "}
        <code>invalidate()</code>. Reports <code>unsupported</code> when{" "}
        <code>refresh</code> is omitted — never invents refresh. Imports{" "}
        <code>ReplayPolicy</code> from authentication-core.
      </dd>
      <dt className="mono">RefreshOutcome</dt>
      <dd>
        Discriminated: <code>refreshed</code>, <code>already-current</code>,{" "}
        <code>unsupported</code>, <code>cancelled</code>, <code>expired</code>,{" "}
        <code>failed</code> (with <code>ErrorClassification</code>).
      </dd>
      <dt className="mono">intercept(operation, meta)</dt>
      <dd>
        Metadata requires explicit <code>replayPolicy</code> (<code>none</code>{" "}
        | <code>read</code> | <code>mutation</code>). Reads may queue and replay
        once. Mutations need <code>acknowledgeMutationReplay</code> +{" "}
        <code>idempotencyKey</code>. <code>queueable: false</code> returns{" "}
        <code>refresh-in-progress</code> during flight. Auth expiry signalled
        via <code>AuthExpiredError</code>.
      </dd>
      <dt className="mono">createFetchInterceptor(options)</dt>
      <dd>
        Optional fetch wrapper: 401 → shared refresh → policy-governed replay.
        Does not infer replay safety from HTTP method.
      </dd>
      <dt className="mono">SessionRefreshProvider / useSessionRefresh()</dt>
      <dd>
        Scoped React binding. Opt-in <code>refreshOnVisible</code> /{" "}
        <code>refreshOnFocus</code> (off by default). Identity/sign-out changes
        invalidate the current generation. Optional <code>runAction</code> for
        action-runner composition.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server requests use their server-owned auth adapter; this item does not install server interceptors or mutate cookies.",
    "No pending-auth-action dependency. ReplayPolicy comes from @app-kit/authentication-core.",
    "Does not sign out, redirect, or show UI on refresh failure — consumer policy owns that handoff.",
    "No timers or focus listeners unless refreshOnVisible / refreshOnFocus / proactiveLeewayMs are configured.",
    "Manual-copy fallback: copy session-refresh.ts to src/lib/session-refresh.ts and session-refresh-provider.tsx to src/components/session-refresh-provider.tsx. Add @app-kit/authentication-core registry dependency.",
  ],
};
