import type { CompleteDocSlots } from "./complete-docs";
import { LoadingOverlayPreview } from "./loading-overlay-preview";

const globalExample = `"use client";

import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
} from "@/components/loading-overlay";

function SaveButton() {
  const overlay = useLoadingOverlay();

  return (
    <button
      type="button"
      onClick={async () => {
        const token = overlay.begin({ label: "Saving" });
        try {
          await save();
          overlay.succeed(token);
        } catch {
          overlay.fail(token, { message: "Save failed" });
        }
      }}
    >
      Save
    </button>
  );
}

export function App() {
  return (
    <LoadingOverlayProvider>
      <LoadingOverlay />
      <SaveButton />
    </LoadingOverlayProvider>
  );
}

async function save() {}
`;

const scopedExample = `"use client";

import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
} from "@/components/loading-overlay";

export function CheckoutForm() {
  return (
    <LoadingOverlayProvider scope="checkout">
      <LoadingOverlay />
      <Submit />
    </LoadingOverlayProvider>
  );
}

function Submit() {
  const overlay = useLoadingOverlay({ scope: "checkout" });

  return (
    <button
      type="button"
      onClick={() => {
        overlay.begin({ label: "Paying", progress: 0.1 });
      }}
    >
      Pay
    </button>
  );
}
`;

const lifecycleExample = `"use client";

import { useLoadingOverlay } from "@/components/loading-overlay";

export function SaveController() {
  const overlay = useLoadingOverlay();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const token = overlay.begin({ label: "Saving" });
          overlay.update(token, { progress: 0.5, label: "Uploading" });
          overlay.succeed(token);
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          const token = overlay.begin();
          overlay.release(token);
        }}
      >
        Cancel
      </button>
    </>
  );
}
`;

const nonBlockingExample = `"use client";

import {
  LoadingOverlay,
  LoadingOverlayProvider,
} from "@/components/loading-overlay";
import type { ReactNode } from "react";

export function StatusPanel({ children }: { children: ReactNode }) {
  return (
    <LoadingOverlayProvider blocking={false} scope="panel">
      <LoadingOverlay />
      {children}
    </LoadingOverlayProvider>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
} from "@/components/loading-overlay";

function App() {
  return (
    <LoadingOverlayProvider>
      <LoadingOverlay />
      <main>App</main>
    </LoadingOverlayProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
} from "@/components/loading-overlay";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LoadingOverlayProvider>
          <LoadingOverlay />
          {children}
        </LoadingOverlayProvider>
      </body>
    </html>
  );
}
`;

export const loadingOverlayDocs: CompleteDocSlots = {
  preview: <LoadingOverlayPreview />,
  examples: [
    { label: "global.tsx", language: "tsx", code: globalExample },
    { label: "scoped.tsx", language: "tsx", code: scopedExample },
    { label: "token-lifecycle.tsx", language: "tsx", code: lifecycleExample },
    { label: "non-blocking.tsx", language: "tsx", code: nonBlockingExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">LoadingOverlayProvider / LoadingOverlay</dt>
      <dd>
        Client-only owner of per-token overlay state. Place the provider near
        the client root, then render <code>LoadingOverlay</code>. Nested
        providers are isolated namespaces. Default scope is <code>default</code>{" "}
        (full-page). Named <code>scope</code> values cover that provider&apos;s
        region. Unknown scopes throw instead of falling back.{" "}
        <code>blocking</code> defaults to true.
      </dd>
      <dt className="mono">useLoadingOverlay()</dt>
      <dd>
        <code>begin</code>, <code>update(token)</code>,{" "}
        <code>succeed(token)</code>, <code>fail(token)</code>,{" "}
        <code>release(token)</code>. Also reads aggregate <code>status</code> (
        <code>idle</code> | <code>loading</code> | <code>success</code> |{" "}
        <code>error</code>), <code>label</code>, and optional determinate{" "}
        <code>progress</code> (0–1). Pass <code>{`{ scope }`}</code> to assert
        the named provider; a mismatch throws. Pre-hydration calls are no-ops
        with a development warning.
      </dd>
      <dt className="mono">Token states</dt>
      <dd>
        Each <code>begin()</code> token is <code>pending</code>, then{" "}
        <code>succeeded</code>, <code>failed</code>, or <code>released</code>.
        Duplicate succeed/fail/release and stale tokens are no-ops. Cancel a
        pending owner with <code>release</code> — it has no presentation.
      </dd>
      <dt className="mono">Aggregate reduction</dt>
      <dd>
        Pending wins. Else fail wins over success. Else success. Else idle.
        Progress is determinate only when every pending token supplied progress.
        Terminal success/error auto-reset to idle after{" "}
        <code>successDurationMs</code> (default 0, no success overlay) and{" "}
        <code>errorDurationMs</code> (default 800). A new <code>begin</code>{" "}
        during the delay returns to loading.
      </dd>
      <dt className="mono">Overlay Layer Registry</dt>
      <dd>
        Blocking overlays register as kind <code>loading</code> when{" "}
        <code>OverlayLayerProvider</code> from modal-manager is an ancestor.
        Non-blocking overlays do not register. Standalone works without the
        registry. This item does not depend on action-runner.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place the provider but must not call overlay operations. Pre-hydration begin/update/succeed/fail/release is a no-op.",
    "No success overlay by default (successDurationMs is 0). Failures show briefly, then auto-reset.",
    "Blocking overlays register with the Overlay Layer Registry when present; they do not take a registry dependency on modal-manager.",
    "The overlay does not classify errors, show toasts, or render raw exception text. Pass a safe metadata.message to fail().",
    "No spinner or motion library. CSS/cssVars are structural and reduced-motion only, on existing tokens.",
    "Manual-copy fallback: copy infra/loading-overlay.tsx to src/components/loading-overlay.tsx (target @components/loading-overlay.tsx).",
  ],
};
