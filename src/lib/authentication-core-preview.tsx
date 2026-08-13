"use client";

import {
  AuthProvider,
  useSession,
} from "../../infra/authentication-core-provider";
import type { AuthenticationAdapter } from "../../infra/authentication-core";

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
  const { status, user } = useSession();
  return (
    <div className="usage-sketch">
      <p>
        <span className="mono">{status}</span>
        {user?.name ? ` → ${user.name}` : ""}
      </p>
      <p>Session seed is UX-only. Mutations re-check the live session.</p>
    </div>
  );
}

export function AuthenticationCorePreview() {
  return (
    <AuthProvider adapter={adapter} sessionSeed={seed}>
      <PreviewBody />
    </AuthProvider>
  );
}
