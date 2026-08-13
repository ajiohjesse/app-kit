import type { CompleteDocSlots } from "./complete-docs";
import { AuthenticationCorePreview } from "./authentication-core-preview";

const providerExample = `"use client";

import { AuthProvider, useSession } from "@/components/authentication-core-provider";
import type { SessionSeed } from "@/lib/authentication-core";
import { spaAdapter } from "./spa-adapter";

export function App({ sessionSeed }: { sessionSeed?: SessionSeed }) {
  return (
    <AuthProvider adapter={spaAdapter} sessionSeed={sessionSeed}>
      <CurrentUser />
    </AuthProvider>
  );
}

function CurrentUser() {
  const { status, user } = useSession();
  if (status === "loading") return <p>Loading session…</p>;
  if (status !== "authenticated") return <p>Signed out</p>;
  return <p>{user.name}</p>;
}
`;

const spaAdapterExample = `import type { AuthenticationAdapter, Session } from "@/lib/authentication-core";
import { classifySignInFailure } from "@/lib/authentication-core";

let memory: Session | null = null;

export const spaAdapter: AuthenticationAdapter<{
  email: string;
  password: string;
}> = {
  getSession: async () => memory,
  signIn: async ({ credentials, signal }) => {
    const session = await fetchSession(credentials, signal);
    if (!session) {
      return {
        status: "failed",
        error: classifySignInFailure(new Error("invalid"), { status: 401 }),
      };
    }
    memory = session;
    return { status: "authenticated", session };
  },
  signOut: async () => {
    memory = null;
  },
};

async function fetchSession(
  _credentials: { email: string; password: string } | undefined,
  _signal?: AbortSignal
): Promise<Session | null> {
  return {
    user: { id: "user-1", name: "Ada Lovelace" },
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}
`;

const seedExample = `"use client";

import { AuthProvider, useSession } from "@/components/authentication-core-provider";
import type { AuthenticationAdapter, SessionSeed } from "@/lib/authentication-core";

export function HydratedApp({
  adapter,
  sessionSeed,
}: {
  adapter: AuthenticationAdapter;
  sessionSeed?: SessionSeed | null;
}) {
  return (
    <AuthProvider adapter={adapter} sessionSeed={sessionSeed}>
      <CurrentUser />
    </AuthProvider>
  );
}

function CurrentUser() {
  const { user } = useSession();
  return <p>{user?.name ?? "Signed out"}</p>;
}
`;

const failureExample = `"use client";

import { useState } from "react";
import { useAuth } from "@/components/authentication-core-provider";

export function SignInForm() {
  const { signIn } = useAuth();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await signIn({
          email: "ada@example.com",
          password: "wrong",
        });
        if (result.status === "failed") {
          setMessage(result.error.message);
        }
      }}
    >
      <button type="submit">Sign in</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
`;

const tokenExchangeExample = `import type { AuthenticationAdapter, Session } from "@/lib/authentication-core";

export const tokenExchangeAdapter: AuthenticationAdapter<
  never,
  { code: string }
> = {
  getSession: async () => null,
  signIn: async () => {
    throw new Error("Use exchangeToken for this adapter");
  },
  signOut: async () => undefined,
  exchangeToken: async ({ payload }) => {
    const session = await exchangeAuthorizationCode(payload?.code);
    return session;
  },
};

async function exchangeAuthorizationCode(_code: string | undefined): Promise<Session> {
  return {
    user: { id: "user-1", name: "Ada Lovelace" },
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}
`;

const spaRecipe = `"use client";

import { AuthProvider, useAuth } from "@/components/authentication-core-provider";
import { spaAdapter } from "./spa-adapter";

export function SpaRoot() {
  return (
    <AuthProvider adapter={spaAdapter}>
      <SignInButton />
    </AuthProvider>
  );
}

function SignInButton() {
  const { status, signIn, signOut, user } = useAuth();
  if (status === "authenticated") {
    return (
      <button type="button" onClick={() => void signOut()}>
        Sign out {user.name}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void signIn({ email: "ada@example.com", password: "secret" })}
    >
      Sign in
    </button>
  );
}
`;

const serverRecipe = `import "server-only";

import { createServerSessionReader } from "@/lib/authentication-core.server";

const sessionCookie = process.env.SESSION_COOKIE_SECRET;

export const serverSessions = createServerSessionReader({
  read: async ({ request }) => {
    void sessionCookie;
    const session = await readHttpOnlySession(request);
    return session;
  },
});

async function readHttpOnlySession(_request: unknown) {
  return {
    user: { id: "user-1", name: "Ada Lovelace" },
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}
`;

const nextRecipe = `import { AuthProvider } from "@/components/authentication-core-provider";
import { spaAdapter } from "./spa-adapter";
import { serverSessions } from "./authentication-core.server";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionSeed = await serverSessions.toSessionSeed();
  return (
    <html lang="en">
      <body>
        <AuthProvider adapter={spaAdapter} sessionSeed={sessionSeed}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
`;

const cookieAdapterExample = `import type { AuthenticationAdapter } from "@/lib/authentication-core";
import { classifySignInFailure } from "@/lib/authentication-core";

export const cookieSessionAdapter: AuthenticationAdapter<{
  email: string;
  password: string;
}> = {
  getSession: async ({ signal } = {}) => {
    const response = await fetch("/api/session", { signal });
    if (!response.ok) return null;
    return response.json();
  },
  signIn: async ({ credentials, signal }) => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
      signal,
    });
    if (response.status === 401) {
      return {
        status: "failed",
        error: classifySignInFailure(new Error("invalid"), { status: 401 }),
      };
    }
    if (!response.ok) {
      return {
        status: "failed",
        error: classifySignInFailure(new Error("unavailable"), {
          status: response.status,
        }),
      };
    }
    return { status: "authenticated", session: await response.json() };
  },
  signOut: async ({ signal } = {}) => {
    await fetch("/api/session", { method: "DELETE", signal });
  },
};
`;

export const authenticationCoreDocs: CompleteDocSlots = {
  preview: <AuthenticationCorePreview />,
  examples: [
    { label: "provider.tsx", language: "tsx", code: providerExample },
    {
      label: "spa-adapter.ts",
      language: "typescript",
      code: spaAdapterExample,
    },
    { label: "seed.tsx", language: "tsx", code: seedExample },
    { label: "failure.tsx", language: "tsx", code: failureExample },
    {
      label: "token-exchange.ts",
      language: "typescript",
      code: tokenExchangeExample,
    },
    {
      label: "cookie-session.ts",
      language: "typescript",
      code: cookieAdapterExample,
    },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    {
      label: "authentication-core.server.ts",
      language: "typescript",
      code: serverRecipe,
    },
    { label: "layout.tsx", language: "tsx", code: nextRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">AuthUser</dt>
      <dd>
        Provider-neutral identity with a stable opaque <code>id</code> and
        optional safe display fields (<code>name</code>, <code>email</code>,{" "}
        <code>image</code>) plus JSON-compatible metadata. Tokens and secrets
        are never copied onto the user.
      </dd>
      <dt className="mono">Session / SessionSeed</dt>
      <dd>
        Serializable session: <code>user</code>, ISO-8601 UTC{" "}
        <code>expiresAt</code>, optional opaque <code>sessionId</code>. A
        session seed is the same shape used as a UX-only initial snapshot, not
        authorization for mutations. Metadata keeps at most 16 primitive keys
        (string/number/boolean/null, strings up to 200 chars) and drops nested
        objects and token-shaped keys.
      </dd>
      <dt className="mono">ReplayPolicy</dt>
      <dd>
        Owned here as{" "}
        <code>&quot;none&quot; | &quot;read&quot; | &quot;mutation&quot;</code>.
        Pending intents may use only <code>read</code> or <code>mutation</code>.
        Session refresh uses the full union.
      </dd>
      <dt className="mono">AuthenticationAdapter</dt>
      <dd>
        Required <code>getSession</code>, <code>signIn</code>, and idempotent{" "}
        <code>signOut</code>. Optional <code>refresh</code> and{" "}
        <code>exchangeToken</code> throw{" "}
        <code>UnsupportedAuthCapabilityError</code> when absent. Methods accept
        an optional <code>AbortSignal</code>.
      </dd>
      <dt className="mono">signIn result</dt>
      <dd>
        Success is <code>{`{ status: "authenticated"; session }`}</code>.
        Expected failure is{" "}
        <code>{`{ status: "failed"; error: ErrorClassification }`}</code>.
        Invalid credentials map to <code>authentication</code> with redacted
        code <code>invalid-credentials</code>. Misconfigured adapters throw.
      </dd>
      <dt className="mono">AuthProvider / useAuth() / useSession()</dt>
      <dd>
        Client-only. Requires an adapter and accepts an optional secret-free
        seed. With a seed, state initializes synchronously. Without one, one
        initial <code>getSession</code>. Public status is <code>loading</code>,{" "}
        <code>authenticated</code>, <code>unauthenticated</code>, or{" "}
        <code>error</code>.
      </dd>
      <dt className="mono">createServerSessionReader(config)</dt>
      <dd>
        Server factory in <code>@lib/authentication-core.server.ts</code>. Close
        over cookie secrets inside <code>read</code>.{" "}
        <code>toSessionSeed()</code> returns a secret-free snapshot for the
        client provider.
      </dd>
      <dt className="mono">classifySignInFailure(error, context?)</dt>
      <dd>
        Maps adapter failures onto the shared <code>ErrorClassification</code>{" "}
        model from <code>@app-kit/error-classification</code>.
      </dd>
    </dl>
  ),
  limitations: [
    'Server helpers live in @lib/authentication-core.server.ts and must start with import "server-only". Client graphs must not import that module.',
    "A session seed is UX-only. Protected mutations must re-check the live session. Cookie/session apps that need freshness should install session-refresh.",
    "Core does not poll, schedule refresh timers, redirect, render UI chrome, or ship a vendor auth SDK. Reference adapters are documentation-only sketches using consumer-owned transport functions.",
    "refresh() and exchangeToken() report unsupported when the adapter omits them. They are not silently emulated.",
    "Manual-copy fallback: copy the lib to src/lib/authentication-core.ts (target @lib/authentication-core.ts), the provider to src/components/authentication-core-provider.tsx (target @components/authentication-core-provider.tsx), the server helper to src/lib/authentication-core.server.ts (target @lib/authentication-core.server.ts), and the server-only ambient types to src/lib/authentication-core-env.d.ts. Add the server-only npm dependency and the @app-kit/error-classification registry dependency.",
  ],
};
