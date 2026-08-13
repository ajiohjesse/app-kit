import type { CompleteDocSlots } from "./complete-docs";
import { FeatureFlagsPreview } from "./feature-flags-preview";

const schemaExample = `import type { FlagSchema } from "@/lib/feature-flags";

export const flagSchema = {
  checkout: {
    type: "boolean",
    default: false,
    exposure: "public",
  },
  theme: {
    type: "variant",
    variants: ["light", "dark"],
    default: "light",
    exposure: "public",
  },
  internalBilling: {
    type: "boolean",
    default: false,
    exposure: "server-only",
  },
} as const satisfies FlagSchema;
`;

const providerExample = `"use client";

import { FeatureFlagProvider, useFlag } from "@/components/feature-flags-provider";
import type { FlagSnapshot } from "@/lib/feature-flags";
import { flagSchema } from "./flag-schema";

export function CheckoutButton({ snapshot }: { snapshot?: FlagSnapshot }) {
  return (
    <FeatureFlagProvider
      schema={flagSchema}
      schemaVersion="flags-v1"
      snapshot={snapshot}
    >
      <Button />
    </FeatureFlagProvider>
  );
}

function Button() {
  const enabled = useFlag("checkout");
  return <button type="button" disabled={!enabled}>Checkout</button>;
}
`;

const refreshExample = `"use client";

import { useFlags } from "@/components/feature-flags-provider";
import type { FlagAdapter } from "@/lib/feature-flags";

export const staticFlagAdapter: FlagAdapter = {
  evaluate: async () => ({ checkout: true, theme: "dark" }),
};

export function RefreshFlags() {
  const { refresh, refreshing } = useFlags();
  return (
    <button type="button" disabled={refreshing} onClick={() => void refresh()}>
      Refresh flags
    </button>
  );
}
`;

const serverRecipe = `import "server-only";

import { createServerFlagAdapter } from "@/lib/feature-flags.server";
import { flagSchema } from "./flag-schema";

const sdkKey = process.env.FLAG_SDK_KEY;

export const serverFlags = createServerFlagAdapter({
  schema: flagSchema,
  schemaVersion: "flags-v1",
  read: async ({ context, request }) => {
    void sdkKey;
    void request;
    return {
      checkout: true,
      theme: "dark",
      internalBilling: context?.userId === "ops",
    };
  },
});

export async function bootstrapFlags(userId?: string) {
  return serverFlags.snapshot({
    context: userId ? { userId } : undefined,
  });
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import { FeatureFlagProvider, useFlag } from "@/components/feature-flags-provider";
import type { FlagAdapter } from "@/lib/feature-flags";
import { flagSchema } from "./flag-schema";

const adapter: FlagAdapter = {
  evaluate: () => ({ checkout: true, theme: "light" }),
};

function CheckoutLabel() {
  return <p>checkout: {String(useFlag("checkout"))}</p>;
}

function App() {
  return (
    <FeatureFlagProvider
      schema={flagSchema}
      schemaVersion="flags-v1"
      adapter={adapter}
    >
      <CheckoutLabel />
    </FeatureFlagProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
import { FeatureFlagProvider } from "@/components/feature-flags-provider";
import { bootstrapFlags } from "@/lib/flags.server";
import { flagSchema } from "./flag-schema";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const snapshot = await bootstrapFlags();
  return (
    <html lang="en">
      <body>
        <FeatureFlagProvider
          schema={flagSchema}
          schemaVersion="flags-v1"
          snapshot={snapshot}
        >
          {children}
        </FeatureFlagProvider>
      </body>
    </html>
  );
}
`;

export const featureFlagsDocs: CompleteDocSlots = {
  preview: <FeatureFlagsPreview />,
  examples: [
    { label: "flag-schema.ts", language: "typescript", code: schemaExample },
    { label: "provider.tsx", language: "tsx", code: providerExample },
    { label: "refresh.tsx", language: "tsx", code: refreshExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "layout.tsx", language: "tsx", code: nextRecipe },
    {
      label: "feature-flags.server.ts",
      language: "typescript",
      code: serverRecipe,
    },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">FlagSchema</dt>
      <dd>
        Consumer-declared map of flag keys. Each entry sets <code>type</code> (
        <code>boolean</code> or <code>variant</code>), a safe{" "}
        <code>default</code>, allowed <code>variants</code> when needed, and{" "}
        <code>exposure</code> (<code>public</code> or <code>server-only</code>).
      </dd>
      <dt className="mono">FlagSnapshot</dt>
      <dd>
        Serializable evaluated values plus <code>schemaVersion</code>, optional{" "}
        <code>evaluatedAt</code>, and optional <code>identityKey</code>. Public
        snapshots never include server-only flags.
      </dd>
      <dt className="mono">createFlagSnapshot(schema, input)</dt>
      <dd>
        Validates raw values against the schema. Missing, wrong-typed, and
        disallowed values resolve to the schema default. Diagnostics include
        only key, expected schema, fallback reason, and snapshot version.
      </dd>
      <dt className="mono">FeatureFlagProvider</dt>
      <dd>
        Client-only owner of the current snapshot. A valid bootstrap{" "}
        <code>snapshot</code> is authoritative on the first render. Optional{" "}
        <code>adapter</code>, <code>evaluationContext</code>, explicit{" "}
        <code>overrides</code>, and opt-in <code>refresh</code> interval or
        window-focus triggers. No timers or listeners by default.
      </dd>
      <dt className="mono">useFlag(key) / useFlags()</dt>
      <dd>
        Read public flags. <code>useFlags()</code> also returns{" "}
        <code>refresh()</code> and <code>refreshing</code>. Client reads of
        server-only keys throw <code>ServerOnlyFlagError</code>.
      </dd>
      <dt className="mono">createServerFlagAdapter(config)</dt>
      <dd>
        Server factory in <code>@lib/feature-flags.server.ts</code>. Close over
        credentials inside <code>read</code>. <code>snapshot()</code> defaults
        to a client-safe snapshot; pass <code>includeServerOnly: true</code>{" "}
        only for server evaluation.
      </dd>
      <dt className="mono">FlagAdapter</dt>
      <dd>
        <code>evaluate</code> receives optional evaluation context and an abort
        signal, then returns raw flag values. App Kit does not ship a vendor
        SDK; the docs reference adapter is the integration shape.
      </dd>
      <dt className="mono">sync</dt>
      <dd>
        Optional injected cross-tab mechanism. Incoming snapshots are validated
        and replaced atomically. Not installed by default.
      </dd>
      <dt className="mono">FlagEvaluationContext</dt>
      <dd>
        Optional sanitized <code>userId</code> (for example{" "}
        <code>AuthUser.id</code>) and consumer-sanitized attributes. Never a
        session, token, credential, or raw provider payload. authentication-core
        is not a registry dependency.
      </dd>
    </dl>
  ),
  limitations: [
    'Server helpers live in @lib/feature-flags.server.ts and must start with import "server-only". Client graphs must not import that module.',
    "Server-only flag values never enter client bootstrap, bundles, render, or logs.",
    "Refresh is explicit or opt-in. The last valid snapshot is kept while a refresh is pending or invalid, and replaced atomically when the new snapshot validates.",
    "When the evaluation identity changes, the current snapshot is invalidated and must be re-evaluated. A snapshot for one identity may not continue under another.",
    "Overrides are explicit and typed. They are not inferred from environment or enabled in production automatically.",
    "Manual-copy fallback: copy the lib to src/lib/feature-flags.ts (target @lib/feature-flags.ts), the provider to src/components/feature-flags-provider.tsx (target @components/feature-flags-provider.tsx), the server helper to src/lib/feature-flags.server.ts (target @lib/feature-flags.server.ts), and the server-only ambient types to src/lib/feature-flags-env.d.ts. Add the server-only npm dependency.",
  ],
};
