import { AuthGuardSmokeClient } from "./smoke-client";
import type { SessionSeed } from "../../../infra/authentication-core";

export default async function AuthGuardSmokePage({
  searchParams,
}: {
  searchParams: Promise<{ revoked?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";
  const sessionSeed: SessionSeed = {
    user: { id: "user-1", name: "Test User" },
    expiresAt: "2030-01-01T00:00:00.000Z",
  };

  return <AuthGuardSmokeClient sessionSeed={sessionSeed} revoked={revoked} />;
}
