"use client";

import { useMemo, useState } from "react";
import {
  AuthProvider,
  useAuth,
} from "../../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  Session,
} from "../../../infra/authentication-core";
import {
  PendingActionHandlerRegistration,
  PendingAuthActionProvider,
  usePendingAuthAction,
} from "../../../infra/pending-auth-action-provider";
import { createMemoryPendingActionStore } from "../../../infra/pending-auth-action";

const signedInSession: Session = {
  user: { id: "user-1", name: "Test User" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function createSmokeAdapter(): AuthenticationAdapter {
  let live: Session | null = null;
  return {
    getSession: async () => live,
    signIn: async () => {
      live = signedInSession;
      return { status: "authenticated", session: signedInSession };
    },
    signOut: async () => {
      live = null;
    },
  };
}

function SmokeBody({ path }: { path: string }) {
  const auth = useAuth();
  const { registerIntent, resume } = usePendingAuthAction();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [result, setResult] = useState("idle");

  return (
    <main>
      <h1>{auth.user?.name ?? auth.status}</h1>
      <p>status:{auth.status}</p>
      <p>path:{path}</p>
      <p>result:{result}</p>
      <PendingActionHandlerRegistration
        kind="open-invoice"
        handler={async () => ({ status: "succeeded" })}
      />
      <button
        type="button"
        onClick={async () => {
          const intent = await registerIntent({
            kind: "open-invoice",
            version: 1,
            payload: { invoiceId: "inv-1" },
            returnTo: "/invoices/inv-1",
            idempotencyKey: "open-inv-1",
            replayPolicy: "read",
          });
          setIntentId(intent.id);
          setResult(`registered:${intent.id}`);
        }}
      >
        Register intent
      </button>
      <button type="button" onClick={() => void auth.signIn()}>
        Sign in
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!intentId) {
            setResult("missing-intent");
            return;
          }
          const outcome = await resume({ intentId });
          setResult(outcome.status);
        }}
      >
        Resume
      </button>
    </main>
  );
}

function PendingAuthBridge({
  store,
}: {
  store: ReturnType<typeof createMemoryPendingActionStore>;
}) {
  const auth = useAuth();
  const [path, setPath] = useState("/");

  return (
    <PendingAuthActionProvider
      store={store}
      getSession={async () =>
        auth.status === "authenticated" ? auth.session : null
      }
      navigate={(to) => {
        setPath(to);
      }}
    >
      <SmokeBody path={path} />
    </PendingAuthActionProvider>
  );
}

export default function PendingAuthActionSmokePage() {
  const store = useMemo(() => createMemoryPendingActionStore(), []);
  const adapter = useMemo(() => createSmokeAdapter(), []);

  return (
    <AuthProvider adapter={adapter}>
      <PendingAuthBridge store={store} />
    </AuthProvider>
  );
}
