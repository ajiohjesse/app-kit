"use client";

import { useMemo, useState } from "react";
import {
  AuthProvider,
  useSession,
} from "../../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  AuthSnapshot,
  Session,
  SessionSeed,
} from "../../../infra/authentication-core";
import { AuthGuard, withAuthGuard } from "../../../infra/auth-guard-boundary";

const liveSession: Session = {
  user: { id: "user-1", name: "Test User" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function createSmokeAdapter(revoked: boolean): AuthenticationAdapter {
  return {
    getSession: async () => (revoked ? null : liveSession),
    signIn: async () => ({ status: "authenticated", session: liveSession }),
    signOut: async () => undefined,
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
