import type { CompleteDocSlots } from "./complete-docs";
import { IdleTimeoutPreview } from "./idle-timeout-preview";

const providerExample = `"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";
import {
  IdleTimeoutProvider,
  useIdleTimeout,
} from "@/components/idle-timeout-provider";

function Status() {
  const { snapshot } = useIdleTimeout();
  return <p>Idle: {snapshot.state}</p>;
}

function AppBody() {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <IdleTimeoutProvider
      idleMs={14 * 60_000}
      warningMs={60_000}
      confirm={confirmAdapter}
      auth={{
        signOut: async () => {
          await fetch("/api/sign-out", { method: "POST" });
        },
      }}
      scopeKey="acme-app"
    >
      <Status />
    </IdleTimeoutProvider>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <AppBody />
    </ModalManagerProvider>
  );
}
`;

const warningExample = `"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { IdleTimeoutProvider } from "@/components/idle-timeout-provider";

export function IdleShell({ children }: { children: React.ReactNode }) {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <IdleTimeoutProvider
      confirm={confirmAdapter}
      warningCopy={{
        idleTitle: "Still there?",
        idleDescription:
          "You will be signed out soon due to inactivity.",
      }}
      auth={{
        signOut: async () => {
          await fetch("/api/sign-out", { method: "POST" });
        },
      }}
    >
      {children}
    </IdleTimeoutProvider>
  );
}
`;

const continueVsRefreshExample = `"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/components/authentication-core-provider";
import { IdleTimeoutProvider } from "@/components/idle-timeout-provider";

export function SessionAwareIdle({
  children,
}: {
  children: React.ReactNode;
}) {
  const { confirm } = useConfirmDialog();
  const auth = useAuth();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);
  const expiresAt =
    auth.status === "authenticated" ? auth.session.expiresAt : null;

  return (
    <IdleTimeoutProvider
      confirm={confirmAdapter}
      sessionExpiresAt={expiresAt}
      auth={{
        signOut: () => auth.signOut(),
        // Inject refresh only when you want "Refresh session".
        // Idle Continue never calls refresh.
        refresh: () => auth.refresh(),
      }}
    >
      {children}
    </IdleTimeoutProvider>
  );
}
`;

const crossTabExample = `"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  IdleTimeoutProvider,
  createBroadcastIdleChannel,
} from "@/components/idle-timeout-provider";

export function CrossTabIdle({ children }: { children: React.ReactNode }) {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);
  const channel = useMemo(
    () => createBroadcastIdleChannel("acme-app"),
    []
  );

  return (
    <IdleTimeoutProvider
      confirm={confirmAdapter}
      scopeKey="acme-app"
      channel={channel}
      // Default when auth.signOut is set: terminal sign-out/timed-out
      // messages propagate across tabs. Activity stays local.
      auth={{
        signOut: async () => {
          await fetch("/api/sign-out", { method: "POST" });
        },
      }}
    >
      {children}
    </IdleTimeoutProvider>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";
import { IdleTimeoutProvider } from "@/components/idle-timeout-provider";

function Shell() {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <IdleTimeoutProvider
      confirm={confirmAdapter}
      auth={{ signOut: async () => undefined }}
    >
      <main>App</main>
    </IdleTimeoutProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ModalManagerProvider>
    <ModalManager />
    <Shell />
  </ModalManagerProvider>
);
`;

const nextRecipe = `"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";
import { IdleTimeoutProvider } from "@/components/idle-timeout-provider";

export function IdleProviders({ children }: { children: ReactNode }) {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ModalManagerProvider>
      <ModalManager />
      <IdleTimeoutProvider
        confirm={confirmAdapter}
        auth={{
          signOut: async () => {
            await fetch("/api/sign-out", { method: "POST" });
          },
        }}
      >
        {children}
      </IdleTimeoutProvider>
    </ModalManagerProvider>
  );
}
`;

export const idleTimeoutDocs: CompleteDocSlots = {
  preview: <IdleTimeoutPreview />,
  examples: [
    {
      label: "provider.tsx",
      code: providerExample,
      language: "tsx",
    },
    {
      label: "warning-copy.tsx",
      code: warningExample,
      language: "tsx",
    },
    {
      label: "continue-vs-refresh.tsx",
      code: continueVsRefreshExample,
      language: "tsx",
    },
    {
      label: "cross-tab-sign-out.tsx",
      code: crossTabExample,
      language: "tsx",
    },
  ],
  spaRecipes: [
    {
      label: "spa-root.tsx",
      code: spaRecipe,
      language: "tsx",
    },
  ],
  nextRecipes: [
    {
      label: "idle-providers.tsx",
      code: nextRecipe,
      language: "tsx",
    },
  ],
  api: (
    <dl>
      <dt className="mono">IdleTimeoutProvider</dt>
      <dd>
        Client-only coordinator. Tracks{" "}
        <code>active | warning | timed-out</code>, opens confirm-dialog
        warnings, and never refreshes authentication on idle Continue.
      </dd>
      <dt className="mono">useIdleTimeout()</dt>
      <dd>
        Returns <code>snapshot</code>, <code>reset</code>, <code>extend</code>,{" "}
        <code>signOut</code>, and <code>noteActivity</code>. Snapshot includes
        deadlines and <code>remainingWarningMs</code> while warning.
      </dd>
      <dt className="mono">createIdleTimeout()</dt>
      <dd>
        Headless factory for tests and non-React hosts. Inject{" "}
        <code>clock</code> (FakeClock in tests), <code>confirm</code>,{" "}
        <code>auth</code>, and optional <code>channel</code>.
      </dd>
      <dt className="mono">Defaults</dt>
      <dd>
        Idle <code>15m</code>, warning <code>60s</code>, activity throttle{" "}
        <code>1s</code>, events <code>pointerdown</code>, <code>keydown</code>,{" "}
        <code>wheel</code>, <code>touchstart</code>. Visibility pauses activity
        handling only — deadlines still advance.
      </dd>
      <dt className="mono">Warning actions</dt>
      <dd>
        Idle: Continue (extend only) / Sign out. Session-expiry: Refresh session
        only if <code>auth.refresh</code> is injected; otherwise Dismiss
        warning. Escape/dismiss keeps the warning and countdown (fail-safe).
      </dd>
      <dt className="mono">Cross-tab</dt>
      <dd>
        When <code>auth.signOut</code> is provided, terminal{" "}
        <code>signed-out</code> / <code>timed-out</code> events propagate across
        tabs by default via <code>BroadcastChannel</code>. Opt out with{" "}
        <code>crossTabSignOut={"{false}"}</code> or{" "}
        <code>channel={"{null}"}</code>. Activity is never broadcast.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Place the provider in a Client Component tree under ModalManagerProvider.",
    "Does not own credentials, redirects, or dialog UI — inject auth + confirm-dialog.",
    "Idle Continue never calls refresh. Session Refresh is opt-in via auth.refresh.",
    "Manual-copy: infra/idle-timeout.ts → src/lib/idle-timeout.ts and infra/idle-timeout-provider.tsx → src/components/idle-timeout-provider.tsx. Install @app-kit/confirm-dialog.",
  ],
};
