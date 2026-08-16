import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  useAuth,
} from "../../infra/authentication-core-provider";
import type {
  AuthenticationAdapter,
  Session,
} from "../../infra/authentication-core";
import { AuthGuard, AuthGuardProvider } from "../../infra/auth-guard-boundary";
import {
  createMemoryPendingActionStore,
  createPendingActionIntent,
} from "../../infra/pending-auth-action";
import { PendingActionHandlerRegistration } from "../../infra/pending-auth-action-provider";

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

describe("AuthGuardProvider", () => {
  it("resumes a pending intent after session is authenticated", async () => {
    const store = createMemoryPendingActionStore();
    const intent = createPendingActionIntent({
      id: "intent-1",
      kind: "open-invoice",
      version: 1,
      payload: { invoiceId: "inv-1" },
      returnTo: "/invoices/inv-1",
      idempotencyKey: "open-inv-1",
      replayPolicy: "read",
      userId: "user-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    await store.save(intent);

    const navigate = vi.fn();
    const onResumeResult = vi.fn();
    let live: Session | null = null;
    const adapter = createAdapter({
      getSession: async () => live,
      signIn: async () => {
        live = session;
        return { status: "authenticated", session };
      },
    });

    function SignInButton() {
      const auth = useAuth();
      return (
        <button type="button" onClick={() => void auth.signIn()}>
          sign-in
        </button>
      );
    }

    render(
      <AuthProvider adapter={adapter}>
        <AuthGuardProvider
          store={store}
          navigate={navigate}
          resumeIntentId="intent-1"
          onResumeResult={onResumeResult}
        >
          <PendingActionHandlerRegistration
            kind="open-invoice"
            handler={async () => ({ status: "succeeded" })}
          />
          <SignInButton />
        </AuthGuardProvider>
      </AuthProvider>
    );

    screen.getByRole("button", { name: "sign-in" }).click();

    await waitFor(() => {
      expect(onResumeResult).toHaveBeenCalledWith({
        status: "succeeded",
        intentId: "intent-1",
      });
    });
    expect(navigate).toHaveBeenCalledWith("/invoices/inv-1");
  });
});
