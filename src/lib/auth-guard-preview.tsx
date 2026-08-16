"use client";

import { useState } from "react";
import {
  AuthProvider,
  useSession,
} from "../../infra/authentication-core-provider";
import type { AuthenticationAdapter } from "../../infra/authentication-core";
import { AuthGuard, withAuthGuard } from "../../infra/auth-guard-boundary";

const seed = {
  user: { id: "user-1", name: "Ada Lovelace" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

const adapter: AuthenticationAdapter = {
  getSession: async () => seed,
  signIn: async () => ({ status: "authenticated", session: seed }),
  signOut: async () => undefined,
};

function PreviewBody() {
  const auth = useSession();
  const [result, setResult] = useState<string>("idle");

  return (
    <div className="usage-sketch">
      <AuthGuard policy="inline" fallback={<p>Sign in to continue</p>}>
        <p>
          <span className="mono">{auth.status}</span>
          {auth.user?.name ? ` → ${auth.user.name}` : ""}
        </p>
      </AuthGuard>
      <button
        type="button"
        onClick={async () => {
          const guarded = withAuthGuard(async () => "saved", {
            readSession: async () => auth,
            policy: "inline",
          });
          const outcome = await guarded({});
          setResult(outcome.status);
        }}
      >
        Guarded save
      </button>
      <p>result:{result}</p>
      <p>Policies are explicit. Seed is UX-only.</p>
    </div>
  );
}

export function AuthGuardPreview() {
  return (
    <AuthProvider adapter={adapter} sessionSeed={seed}>
      <PreviewBody />
    </AuthProvider>
  );
}
