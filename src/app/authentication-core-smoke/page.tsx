import { createServerSessionReader } from "../../../infra/authentication-core.server";
import { AuthenticationCoreSmokeClient } from "./smoke-client";

export default async function AuthenticationCoreSmokePage({
  searchParams,
}: {
  searchParams: Promise<{ revoked?: string }>;
}) {
  const { revoked } = await searchParams;
  const reader = createServerSessionReader({
    read: () => {
      const credential = "cookie-session-secret";
      void credential;
      return {
        user: { id: "user-1", name: "Test User" },
        expiresAt: "2030-01-01T00:00:00.000Z",
        accessToken: credential,
      };
    },
  });
  const sessionSeed = await reader.toSessionSeed();
  return (
    <AuthenticationCoreSmokeClient
      sessionSeed={sessionSeed}
      revoked={revoked === "1"}
    />
  );
}
