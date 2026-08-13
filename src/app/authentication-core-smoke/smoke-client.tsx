"use client";

import { useState } from "react";
import {
  AuthProvider,
  useAuth,
} from "../../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  Session,
  SessionSeed,
} from "../../../infra/authentication-core";

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

function SmokeBody({ revoked }: { revoked: boolean }) {
  const { status, user } = useAuth();
  const [result, setResult] = useState<string | null>(null);

  return (
    <main>
      <h1>{user?.name ?? status}</h1>
      <p>status:{status}</p>
      <button
        type="button"
        onClick={async () => {
          const live = await createSmokeAdapter(revoked).getSession();
          setResult(live ? "saved" : "blocked");
        }}
      >
        Save
      </button>
      {result ? <p>{result}</p> : null}
    </main>
  );
}

export function AuthenticationCoreSmokeClient({
  sessionSeed,
  revoked,
}: {
  sessionSeed: SessionSeed | null;
  revoked: boolean;
}) {
  return (
    <AuthProvider
      adapter={createSmokeAdapter(revoked)}
      sessionSeed={sessionSeed}
    >
      <SmokeBody revoked={revoked} />
    </AuthProvider>
  );
}
