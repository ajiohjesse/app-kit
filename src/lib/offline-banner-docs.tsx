import type { CompleteDocSlots } from "./complete-docs";
import { OfflineBannerPreview } from "./offline-banner-preview";

const providerExample = `"use client";

import {
  ConnectivityProvider,
  useConnectivity,
} from "@/components/offline-banner";

function Status() {
  const { state } = useConnectivity();
  return <p>Connectivity: {state}</p>;
}

export function App() {
  return (
    <ConnectivityProvider>
      <Status />
    </ConnectivityProvider>
  );
}
`;

const bannerExample = `"use client";

import {
  ConnectivityProvider,
  OfflineBanner,
} from "@/components/offline-banner";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <ConnectivityProvider>
      <OfflineBanner />
      {children}
    </ConnectivityProvider>
  );
}
`;

const probeExample = `"use client";

import {
  ConnectivityProvider,
  OfflineBanner,
  type ReachabilityProbe,
} from "@/components/offline-banner";
import type { ReactNode } from "react";

const probe: ReachabilityProbe = async ({ signal }) => {
  const response = await fetch("/health", { signal });
  if (!response.ok) {
    throw new Error("unreachable");
  }
};

export function App({ children }: { children: ReactNode }) {
  return (
    <ConnectivityProvider
      probe={probe}
      timeoutMs={5_000}
      intervalMs={30_000}
      failureThreshold={2}
    >
      <OfflineBanner />
      {children}
    </ConnectivityProvider>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  ConnectivityProvider,
  OfflineBanner,
} from "@/components/offline-banner";

function App() {
  return (
    <ConnectivityProvider>
      <OfflineBanner />
      <main>App</main>
    </ConnectivityProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
import {
  ConnectivityProvider,
  OfflineBanner,
} from "@/components/offline-banner";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ConnectivityProvider>
          <OfflineBanner />
          {children}
        </ConnectivityProvider>
      </body>
    </html>
  );
}
`;

export const offlineBannerDocs: CompleteDocSlots = {
  preview: <OfflineBannerPreview />,
  examples: [
    { label: "provider.tsx", language: "tsx", code: providerExample },
    { label: "banner.tsx", language: "tsx", code: bannerExample },
    { label: "probe.tsx", language: "tsx", code: probeExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">ConnectivityState</dt>
      <dd>
        Public connectivity snapshot: <code>unknown</code>, <code>online</code>,
        or <code>offline</code>. Probe execution may be checking internally;
        that transition is not a public state.
      </dd>
      <dt className="mono">ConnectivityProvider</dt>
      <dd>
        Client-only owner of browser listeners and timers. Starts from{" "}
        <code>unknown</code> unless <code>initialState</code> is supplied.
        Optional <code>probe</code>, <code>timeoutMs</code> (default 5000),{" "}
        <code>intervalMs</code> (off unless set; 30000 when enabled),{" "}
        <code>failureThreshold</code> (default 2), <code>probeOnInitial</code> /{" "}
        <code>probeOnOnline</code> (default true when a probe is supplied), and{" "}
        <code>maxBackoffMs</code> (default 5 minutes). Nested providers stay
        isolated.
      </dd>
      <dt className="mono">useConnectivity()</dt>
      <dd>
        Returns the current <code>{`{ state }`}</code> snapshot. There is no
        mutation queue, enqueue, or replay API.
      </dd>
      <dt className="mono">ReachabilityProbe</dt>
      <dd>
        Optional consumer-supplied{" "}
        <code>{`({ signal }) => Promise<void>`}</code>. App Kit does not select
        an endpoint or backend. A rejection, timeout, or abort is a failed
        probe. Raw errors never enter the snapshot or banner.
      </dd>
      <dt className="mono">OfflineBanner</dt>
      <dd>
        Accessible status chrome for the current snapshot.{" "}
        <code>role=&quot;status&quot;</code>,{" "}
        <code>aria-live=&quot;polite&quot;</code>,{" "}
        <code>aria-atomic=&quot;true&quot;</code>. Optional{" "}
        <code>offlineMessage</code>, <code>recoveryMessage</code>, and{" "}
        <code>recoveryDurationMs</code> (default 4000; pass 0 to skip the
        recovery announcement). No dismiss, retry, toast, or overlay
        registration.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only observation. Server rendering stays unknown unless you pass a public-state seed, and does not read browser globals.",
    "OfflineBanner is status chrome. It does not take foreground, focus, or escape, and it is not an overlay layer.",
    "The item never queues, retries, serializes, or replays mutations. Action-runner integration is an optional snapshot reader, not a registry dependency.",
    "A reachability probe is optional and abortable. App Kit does not pick an endpoint.",
    "Manual-copy fallback: copy the registry file to src/components/offline-banner.tsx (target @components/offline-banner.tsx) and install the shadcn alert dependency.",
  ],
};
