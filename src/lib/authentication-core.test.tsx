import { render, screen } from "@testing-library/react";
import { act, useEffect, type ReactNode } from "react";
import {
  classifySignInFailure,
  toSession,
  type AuthenticationAdapter,
  type ReplayPolicy,
  type Session,
  type SignInResult,
} from "../../infra/authentication-core";
import {
  AuthProvider,
  MisconfiguredAuthAdapterError,
  UnsupportedAuthCapabilityError,
  useAuth,
  useSession,
} from "../../infra/authentication-core-provider";

const validSession: Session = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expiresAt: "2030-01-01T00:00:00.000Z",
  sessionId: "sess-1",
};

function createAdapter(
  overrides: Partial<AuthenticationAdapter> = {}
): AuthenticationAdapter {
  return {
    getSession: async () => validSession,
    signIn: async () => ({ status: "authenticated", session: validSession }),
    signOut: async () => undefined,
    ...overrides,
  };
}

function Host({
  adapter,
  sessionSeed,
  children,
}: {
  adapter: AuthenticationAdapter;
  sessionSeed?: Session | null;
  children: ReactNode;
}) {
  return (
    <AuthProvider adapter={adapter} sessionSeed={sessionSeed}>
      {children}
    </AuthProvider>
  );
}

describe("session model", () => {
  it("owns ReplayPolicy as none | read | mutation", () => {
    const policies: ReplayPolicy[] = ["none", "read", "mutation"];
    expect(policies).toEqual(["none", "read", "mutation"]);
  });

  it("copies only safe session fields and drops tokens and secrets", () => {
    const session = toSession({
      user: {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        image: "https://example.com/a.png",
        accessToken: "secret-access",
        metadata: {
          plan: "pro",
          token: "secret-meta",
          nested: { leaked: true },
        },
      },
      expiresAt: "2030-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      refreshToken: "secret-refresh",
      accessToken: "secret-access",
    });

    expect(session).toEqual({
      user: {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        image: "https://example.com/a.png",
        metadata: { plan: "pro" },
      },
      expiresAt: "2030-01-01T00:00:00.000Z",
      sessionId: "sess-1",
    });
    expect(JSON.stringify(session)).not.toContain("secret-");
  });

  it("rejects sessions without a stable user id or ISO-8601 UTC expiry", () => {
    expect(
      toSession({
        user: { name: "No Id" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      })
    ).toBeNull();
    expect(
      toSession({
        user: { id: "user-1" },
        expiresAt: "2030-01-01",
      })
    ).toBeNull();
    expect(
      toSession({
        user: { id: "user-1" },
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      })
    ).toBeNull();
  });
});

describe("classifySignInFailure", () => {
  it("maps invalid credentials to authentication with a redacted code", () => {
    expect(
      classifySignInFailure(new Error("bad password"), { status: 401 })
    ).toEqual({
      category: "authentication",
      message: "Sign in to continue.",
      messageKey: "error/authentication",
      retryable: false,
      code: "invalid-credentials",
    });
  });

  it.each([
    [
      { aborted: true },
      "cancelled",
      "aborted",
      "The request was cancelled.",
      false,
    ],
    [
      { status: 429 },
      "rate-limited",
      undefined,
      "Too many requests. Wait a moment and try again.",
      true,
    ],
    [
      { status: 503 },
      "unavailable",
      undefined,
      "The service is temporarily unavailable. Try again.",
      true,
    ],
    [
      { timeout: true },
      "timeout",
      "timeout",
      "The request timed out. Try again.",
      true,
    ],
  ] as const)(
    "maps %j to %s",
    (context, category, code, message, retryable) => {
      expect(classifySignInFailure(new Error("raw"), context)).toEqual({
        category,
        message,
        messageKey: `error/${category}`,
        retryable,
        ...(code ? { code } : {}),
      });
    }
  );

  it("maps anything else to unknown without leaking the raw error", () => {
    const result = classifySignInFailure(
      new Error("ECONNRESET secret-token=abc")
    );
    expect(result).toEqual({
      category: "unknown",
      message: "Something went wrong. Try again.",
      messageKey: "error/unknown",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});

describe("AuthProvider", () => {
  it("initializes synchronously from a seed and does not call getSession", () => {
    const getSession = vi.fn(async () => validSession);
    const first: string[] = [];

    function Probe() {
      const { status, user } = useAuth();
      first.push(status);
      return <p>{user?.name}</p>;
    }

    render(
      <Host adapter={createAdapter({ getSession })} sessionSeed={validSession}>
        <Probe />
      </Host>
    );

    expect(first[0]).toBe("authenticated");
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("treats an expired seed as unauthenticated without fetching", () => {
    const getSession = vi.fn(async () => validSession);

    function Probe() {
      const { status, reason } = useSession();
      return (
        <p>
          {status}:{reason ?? "none"}
        </p>
      );
    }

    render(
      <Host
        adapter={createAdapter({ getSession })}
        sessionSeed={{
          user: { id: "user-1", name: "Test User" },
          expiresAt: "2020-01-01T00:00:00.000Z",
        }}
      >
        <Probe />
      </Host>
    );

    expect(screen.getByText("unauthenticated:expired")).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("starts loading and performs one getSession when there is no seed", async () => {
    const first: string[] = [];
    const getSession = vi.fn(async () => validSession);

    function Probe() {
      const { status, user } = useAuth();
      first.push(status);
      return <p>{user?.name ?? status}</p>;
    }

    render(
      <Host adapter={createAdapter({ getSession })}>
        <Probe />
      </Host>
    );

    expect(first[0]).toBe("loading");
    expect(await screen.findByText("Test User")).toBeInTheDocument();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("returns failed ErrorClassification results without changing the session", async () => {
    const error = classifySignInFailure(new Error("nope"), { status: 401 });
    const signIn = vi.fn(async (): Promise<SignInResult> => ({
      status: "failed",
      error,
    }));
    const seen: SignInResult[] = [];

    function Probe() {
      const { signIn: submit, session, status } = useAuth();
      useEffect(() => {
        void submit({ email: "a@b.c", password: "x" }).then((result) => {
          seen.push(result);
        });
      }, [submit]);
      return (
        <p>
          {status}:{session?.user.name ?? "none"}
        </p>
      );
    }

    render(
      <Host adapter={createAdapter({ signIn })} sessionSeed={validSession}>
        <Probe />
      </Host>
    );

    expect(
      await screen.findByText("authenticated:Test User")
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(seen[0]).toEqual({ status: "failed", error });
    });
  });

  it("throws when a required adapter method is missing", () => {
    expect(() =>
      render(
        <Host
          adapter={
            {
              signIn: async () => ({
                status: "authenticated",
                session: validSession,
              }),
              signOut: async () => undefined,
            } as unknown as AuthenticationAdapter
          }
        >
          <p>child</p>
        </Host>
      )
    ).toThrow(MisconfiguredAuthAdapterError);
  });

  it("reports refresh and exchangeToken as unsupported when omitted", async () => {
    const seen: string[] = [];

    function Probe() {
      const { refresh, exchangeToken } = useAuth();
      useEffect(() => {
        void refresh().catch((error: unknown) => {
          seen.push(error instanceof Error ? error.name : "other");
        });
        void exchangeToken({ code: "abc" }).catch((error: unknown) => {
          seen.push(error instanceof Error ? error.name : "other");
        });
      }, [exchangeToken, refresh]);
      return <p>ready</p>;
    }

    render(
      <Host adapter={createAdapter()} sessionSeed={validSession}>
        <Probe />
      </Host>
    );

    await screen.findByText("ready");
    expect(seen).toEqual([
      "UnsupportedAuthCapabilityError",
      "UnsupportedAuthCapabilityError",
    ]);
    expect(new UnsupportedAuthCapabilityError("refresh").name).toBe(
      "UnsupportedAuthCapabilityError"
    );
  });

  it("becomes unauthenticated with an expiry reason when expiresAt is reached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    function Probe() {
      const { status, reason } = useSession();
      return (
        <p>
          {status}:{reason ?? "none"}
        </p>
      );
    }

    render(
      <Host
        adapter={createAdapter()}
        sessionSeed={{
          user: { id: "user-1", name: "Test User" },
          expiresAt: "2030-01-01T00:00:01.000Z",
        }}
      >
        <Probe />
      </Host>
    );

    expect(screen.getByText("authenticated:none")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("unauthenticated:expired")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not let a stale sign-in overwrite a later sign-out", async () => {
    let resolveSignIn: ((result: SignInResult) => void) | undefined;
    const signIn = vi.fn(
      () =>
        new Promise<SignInResult>((resolve) => {
          resolveSignIn = resolve;
        })
    );
    const signOut = vi.fn(async () => undefined);

    function Probe() {
      const {
        signIn: submit,
        signOut: leave,
        status,
        user,
        reason,
      } = useAuth();
      useEffect(() => {
        void submit({ email: "a@b.c" });
        void leave();
      }, [leave, submit]);
      return (
        <p>
          {status}:{reason ?? user?.name ?? "none"}
        </p>
      );
    }

    render(
      <Host
        adapter={createAdapter({ signIn, signOut })}
        sessionSeed={validSession}
      >
        <Probe />
      </Host>
    );

    expect(
      await screen.findByText("unauthenticated:signed-out")
    ).toBeInTheDocument();
    resolveSignIn?.({ status: "authenticated", session: validSession });
    await Promise.resolve();
    expect(screen.getByText("unauthenticated:signed-out")).toBeInTheDocument();
  });

  it("settles an aborted sign-in as cancelled without changing state", async () => {
    const controller = new AbortController();
    const signIn = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return { status: "authenticated" as const, session: validSession };
    });
    const seen: SignInResult[] = [];

    function Probe() {
      const { signIn: submit, status, user } = useAuth();
      useEffect(() => {
        const pending = submit(
          { email: "a@b.c" },
          { signal: controller.signal }
        );
        controller.abort();
        void pending.then((result) => {
          seen.push(result);
        });
      }, [submit]);
      return (
        <p>
          {status}:{user?.name ?? "none"}
        </p>
      );
    }

    render(
      <Host adapter={createAdapter({ signIn })} sessionSeed={validSession}>
        <Probe />
      </Host>
    );

    expect(
      await screen.findByText("authenticated:Test User")
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(seen[0]).toMatchObject({
        status: "failed",
        error: { category: "cancelled", code: "aborted" },
      });
    });
  });

  it("treats a null getSession as unauthenticated", async () => {
    function Probe() {
      const { status, reason } = useSession();
      return (
        <p>
          {status}:{reason ?? "none"}
        </p>
      );
    }

    render(
      <Host adapter={createAdapter({ getSession: async () => null })}>
        <Probe />
      </Host>
    );

    expect(
      await screen.findByText("unauthenticated:missing")
    ).toBeInTheDocument();
  });

  it("settles a thrown getSession as error without leaking the raw message", async () => {
    function Probe() {
      const { status, error } = useSession();
      return (
        <p>
          {status}:{error?.category ?? "none"}
        </p>
      );
    }

    render(
      <Host
        adapter={createAdapter({
          getSession: async () => {
            throw new Error("secret-token=abc");
          },
        })}
      >
        <Probe />
      </Host>
    );

    expect(await screen.findByText("error:unknown")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("resolves signOut when already signed out", async () => {
    const signOut = vi.fn(async () => undefined);

    function Probe() {
      const { signOut: leave, status } = useAuth();
      useEffect(() => {
        void leave();
      }, [leave]);
      return <p>{status}</p>;
    }

    render(
      <Host adapter={createAdapter({ getSession: async () => null, signOut })}>
        <Probe />
      </Host>
    );

    expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("throws when signIn claims authenticated without a session", async () => {
    const seen: unknown[] = [];

    function Probe() {
      const { signIn: submit } = useAuth();
      useEffect(() => {
        void submit({ email: "a@b.c" }).catch((error: unknown) => {
          seen.push(error);
        });
      }, [submit]);
      return <p>ready</p>;
    }

    render(
      <Host
        adapter={createAdapter({
          signIn: async () => ({ status: "authenticated" }) as SignInResult,
        })}
        sessionSeed={validSession}
      >
        <Probe />
      </Host>
    );

    await screen.findByText("ready");
    await vi.waitFor(() => {
      expect(seen[0]).toBeInstanceOf(MisconfiguredAuthAdapterError);
    });
  });
});
