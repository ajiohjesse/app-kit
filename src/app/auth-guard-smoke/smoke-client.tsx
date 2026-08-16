"use client";

import { useMemo, useState } from "react";
import {
  AuthProvider,
  useAuth,
  useSession,
} from "../../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  AuthSnapshot,
  Session,
  SessionSeed,
} from "../../../infra/authentication-core";
import {
  AuthGuard,
  AuthGuardProvider,
  useGuardedAction,
  withAuthGuard,
} from "../../../infra/auth-guard-boundary";
import { createMemoryPendingActionStore } from "../../../infra/pending-auth-action";
import { PendingActionHandlerRegistration } from "../../../infra/pending-auth-action-provider";

const liveSession: Session = {
  user: { id: "user-1", name: "Test User" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function createSmokeAdapter(revoked: boolean): AuthenticationAdapter {
  let live: Session | null = revoked ? null : liveSession;
  return {
    getSession: async () => live,
    signIn: async () => {
      live = liveSession;
      return { status: "authenticated", session: liveSession };
    },
    signOut: async () => {
      live = null;
    },
  };
}

function snapshotFromLive(session: Session | null): AuthSnapshot {
  if (!session) {
    return {
      status: "unauthenticated",
      session: null,
      user: null,
      reason: "missing",
    };
  }
  return { status: "authenticated", session, user: session.user };
}

function SmokeBody({
  adapter,
  revoked,
}: {
  adapter: AuthenticationAdapter;
  revoked: boolean;
}) {
  const auth = useSession();
  const [result, setResult] = useState<string | null>(null);

  return (
    <main>
      <AuthGuard policy="inline" loading={<p>loading</p>}>
        <h1>{auth.user?.name ?? auth.status}</h1>
        <p>status:{auth.status}</p>
      </AuthGuard>
      <button
        type="button"
        onClick={async () => {
          const guarded = withAuthGuard(async () => "saved", {
            readSession: async () =>
              snapshotFromLive(await adapter.getSession()),
            policy: "inline",
          });
          const outcome = await guarded({});
          setResult(outcome.status === "succeeded" ? "saved" : outcome.status);
        }}
      >
        Guarded save
      </button>
      {result ? <p>{result}</p> : null}
      <p>revoked:{revoked ? "1" : "0"}</p>
    </main>
  );
}

function ResumeSmokeBody({
  adapter,
  path,
  navigate,
  result,
  setResult,
}: {
  adapter: AuthenticationAdapter;
  path: string;
  navigate: (to: string) => void;
  result: string;
  setResult: (value: string) => void;
}) {
  const auth = useAuth();

  const save = useGuardedAction(async () => "saved", {
    readSession: async () => snapshotFromLive(await adapter.getSession()),
    policy: "redirect-and-resume",
    signInTo: "/sign-in",
    navigate,
    getCurrentPath: () => path,
    pendingIntent: {
      kind: "open-invoice",
      version: 1,
      payload: { invoiceId: "inv-1" },
      idempotencyKey: "open-inv-1",
      replayPolicy: "read",
      returnTo: "/invoices/inv-1",
    },
  });

  return (
    <main>
      <h1>{auth.user?.name ?? auth.status}</h1>
      <p>status:{auth.status}</p>
      <p>path:{path}</p>
      <p>result:{result}</p>
      <PendingActionHandlerRegistration
        kind="open-invoice"
        handler={async () => {
          setResult("resumed");
          return { status: "succeeded" };
        }}
      />
      <button type="button" onClick={() => void save({})}>
        Guarded resume save
      </button>
      <button type="button" onClick={() => void auth.signIn()}>
        Sign in
      </button>
    </main>
  );
}

export function AuthGuardSmokeClient({
  sessionSeed,
  revoked,
}: {
  sessionSeed: SessionSeed;
  revoked: boolean;
}) {
  const adapter = useMemo(() => createSmokeAdapter(revoked), [revoked]);

  return (
    <AuthProvider adapter={adapter} sessionSeed={sessionSeed}>
      <SmokeBody adapter={adapter} revoked={revoked} />
    </AuthProvider>
  );
}

export function AuthGuardResumeSmokeClient() {
  const adapter = useMemo(() => createSmokeAdapter(true), []);
  const store = useMemo(() => createMemoryPendingActionStore(), []);
  const [path, setPath] = useState("/");
  const [result, setResult] = useState("idle");
  const [resumeIntentId, setResumeIntentId] = useState<string | null>(null);

  const navigate = (to: string) => {
    setPath(to);
    const intent = new URL(to, "https://app.test").searchParams.get("intent");
    if (intent) {
      setResumeIntentId(intent);
      setResult(`registered:${intent}`);
    }
  };

  return (
    <AuthProvider adapter={adapter}>
      <AuthGuardProvider
        store={store}
        navigate={navigate}
        resumeIntentId={resumeIntentId}
        onResumeResult={(outcome) => {
          if (outcome.status === "succeeded") {
            setResult("resumed");
          } else {
            setResult(outcome.status);
          }
        }}
      >
        <ResumeSmokeBody
          adapter={adapter}
          path={path}
          navigate={navigate}
          result={result}
          setResult={setResult}
        />
      </AuthGuardProvider>
    </AuthProvider>
  );
}
