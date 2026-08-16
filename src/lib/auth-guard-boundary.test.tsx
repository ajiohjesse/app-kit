import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  Session,
} from "../../infra/authentication-core";
import { AuthGuard } from "../../infra/auth-guard-boundary";

const session: Session = {
  user: { id: "user-1", name: "Ada" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function createAdapter(
  overrides: Partial<AuthenticationAdapter> = {}
): AuthenticationAdapter {
  return {
    getSession: async () => session,
    signIn: async () => ({ status: "authenticated", session }),
    signOut: async () => undefined,
    ...overrides,
  };
}

describe("AuthGuard", () => {
  it("renders children immediately from a session seed", () => {
    render(
      <AuthProvider adapter={createAdapter()} sessionSeed={session}>
        <AuthGuard policy="inline" loading={<p>loading-boundary</p>}>
          <p>secret</p>
        </AuthGuard>
      </AuthProvider>
    );

    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(screen.queryByText("loading-boundary")).not.toBeInTheDocument();
  });

  it("shows inline fallback when unauthenticated", async () => {
    render(
      <AuthProvider adapter={createAdapter({ getSession: async () => null })}>
        <AuthGuard policy="inline" fallback={<p>sign-in-please</p>}>
          <p>secret</p>
        </AuthGuard>
      </AuthProvider>
    );

    expect(await screen.findByText("sign-in-please")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
