import type { CompleteDocSlots } from "./complete-docs";
import { ModalManagerPreview } from "./modal-manager-preview";

const stackExample = `"use client";

import {
  ModalManager,
  ModalManagerProvider,
  useModalManager,
} from "@/components/modal-manager-provider";

function Inbox() {
  const modals = useModalManager();

  return (
    <button
      type="button"
      onClick={() => {
        void modals.open({
          title: "Message",
          content: ({ close }) => (
            <div>
              <p>Reply or stack another modal.</p>
              <button
                type="button"
                onClick={() => {
                  void modals.open({
                    title: "Reply",
                    content: ({ close: closeReply }) => (
                      <button type="button" onClick={() => closeReply()}>
                        Close reply
                      </button>
                    ),
                  });
                }}
              >
                Reply
              </button>
              <button type="button" onClick={() => close()}>
                Close
              </button>
            </div>
          ),
        });
      }}
    >
      Open message
    </button>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <Inbox />
    </ModalManagerProvider>
  );
}
`;

const replaceExample = `"use client";

import { useModalManager } from "@/components/modal-manager-provider";

export function SaveFlow() {
  const modals = useModalManager();

  return (
    <button
      type="button"
      onClick={() => {
        const handle = modals.open({
          title: "Edit profile",
          content: ({ close }) => (
            <button
              type="button"
              onClick={() => {
                void modals.replace(handle.id, {
                  title: "Saved",
                  content: ({ close: closeSaved }) => (
                    <button
                      type="button"
                      onClick={() => closeSaved("confirmed")}
                    >
                      Done
                    </button>
                  ),
                });
              }}
            >
              Save
            </button>
          ),
        });
      }}
    >
      Edit
    </button>
  );
}
`;

const alertExample = `"use client";

import { useModalManager } from "@/components/modal-manager-provider";
import type { OverlaySettlement } from "@/lib/modal-manager";

export function DeleteButton() {
  const modals = useModalManager();

  return (
    <button
      type="button"
      onClick={async () => {
        const settlement: OverlaySettlement = await modals.open({
          surface: "alert-dialog",
          title: "Delete file?",
          content: ({ confirm, cancel }) => (
            <div>
              <button type="button" onClick={() => cancel()}>
                Keep
              </button>
              <button type="button" onClick={() => confirm()}>
                Delete
              </button>
            </div>
          ),
        }).result;
        if (settlement === "confirmed") {
          console.log("deleted");
        }
      }}
    >
      Delete
    </button>
  );
}
`;

const layerExample = `"use client";

import { useEffect } from "react";
import { useOverlayLayer } from "@/components/modal-manager-provider";

export function SheetLayer() {
  const overlay = useOverlayLayer();

  useEffect(() => {
    return overlay.registerLayer({
      id: "sheet-root",
      kind: "sheet",
      getRestoreTarget: () => document.getElementById("sheet-restore"),
      onSuspend: () => {
        console.log("sheet suspended");
      },
      onResume: () => {
        console.log("sheet resumed");
      },
    });
  }, [overlay]);

  return null;
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
} from "@/components/modal-manager-provider";

function App() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <main>App</main>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
} from "@/components/modal-manager-provider";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <OverlayLayerProvider>
          <ModalManagerProvider>
            <ModalManager />
            {children}
          </ModalManagerProvider>
        </OverlayLayerProvider>
      </body>
    </html>
  );
}
`;

export const modalManagerDocs: CompleteDocSlots = {
  preview: <ModalManagerPreview />,
  examples: [
    { label: "stack.tsx", language: "tsx", code: stackExample },
    { label: "replace.tsx", language: "tsx", code: replaceExample },
    { label: "alert-dialog.tsx", language: "tsx", code: alertExample },
    { label: "overlay-layer.tsx", language: "tsx", code: layerExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">OverlaySettlement</dt>
      <dd>
        Owned by this item at <code>@lib/modal-manager</code>:{" "}
        <code>confirmed</code> | <code>cancelled</code> | <code>dismissed</code>
        . Escape, backdrop, programmatic close, and provider teardown all settle
        as <code>dismissed</code>. Dependents must not redeclare an incompatible
        union.
      </dd>
      <dt className="mono">OverlayLayerProvider / useOverlayLayer()</dt>
      <dd>
        Overlay Layer Registry for this item.{" "}
        <code>registerLayer(registration)</code>, <code>setForeground(id)</code>
        , <code>clearForeground(id)</code>. Kinds and z-order:{" "}
        <code>sheet</code>, then <code>modal</code>, then blocking{" "}
        <code>loading</code>. Suspend keeps a layer mounted and inert; it does
        not settle entries. Do not mount two registries at the root.
      </dd>
      <dt className="mono">ModalManagerProvider / ModalManager</dt>
      <dd>
        Client-only LIFO overlay layer. Place <code>OverlayLayerProvider</code>{" "}
        around <code>ModalManagerProvider</code>, then render{" "}
        <code>ModalManager</code>. Nested providers stay isolated. If the layer
        provider is missing, the modal provider wraps itself.
      </dd>
      <dt className="mono">useModalManager()</dt>
      <dd>
        <code>open</code>, <code>replace(id, next)</code>,{" "}
        <code>close(id)</code>, <code>closeAll</code>. Each open returns{" "}
        <code>{`{ id, result }`}</code> where <code>result</code> is a promise
        for <code>OverlaySettlement</code>. <code>replace</code> keeps the stack
        slot and lower entries. Invalid ids and cross-scope operations reject.
        Pre-hydration calls are no-ops with a development warning.
      </dd>
      <dt className="mono">surface</dt>
      <dd>
        <code>dialog</code> (default) or <code>alert-dialog</code>. Alert-dialog
        entries render the shadcn Alert Dialog primitive, not a Dialog with a
        swapped ARIA role. Escape dismissal defaults on; backdrop dismissal
        defaults off. Stacked entries are nested primitive trees.
      </dd>
      <dt className="mono">Provider tree</dt>
      <dd>
        Outside-in when several items are installed: error reporting,{" "}
        <code>AuthProvider</code>, <code>FeatureFlagProvider</code>,{" "}
        <code>ConnectivityProvider</code>, then{" "}
        <code>OverlayLayerProvider</code> / <code>ModalManagerProvider</code>,
        then sheet, loading, shortcuts, palette, idle timeout, refresh. Missing
        optional providers must not crash.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place the providers but must not call modal operations. Pre-hydration open/replace/close is a no-op.",
    "This item owns the Overlay Layer Registry. It is not a separate overlay-manager registry item.",
    "Modal and sheet stacks stay separate. Sheets register as layers here; they must not nest inside Dialog.",
    "Modal content may hold callbacks and React nodes. It is not JSON-serializable.",
    "Manual-copy fallback: copy infra/modal-manager.ts to src/lib/modal-manager.ts and infra/modal-manager-provider.tsx to src/components/modal-manager-provider.tsx. Install shadcn dialog and alert-dialog.",
  ],
};
