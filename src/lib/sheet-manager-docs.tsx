import type { CompleteDocSlots } from "./complete-docs";
import { SheetManagerPreview } from "./sheet-manager-preview";

const stackExample = `"use client";

import {
  SheetManager,
  SheetManagerProvider,
  useSheetManager,
} from "@/components/sheet-manager";

function Inbox() {
  const sheets = useSheetManager();

  return (
    <button
      type="button"
      onClick={() => {
        void sheets.open({
          title: "Filters",
          content: ({ close, submit }) => (
            <div>
              <p>Apply filters or dismiss the sheet.</p>
              <button type="button" onClick={() => submit()}>
                Apply
              </button>
              <button type="button" onClick={() => close()}>
                Close
              </button>
            </div>
          ),
        });
      }}
    >
      Open filters
    </button>
  );
}

export function App() {
  return (
    <SheetManagerProvider>
      <SheetManager />
      <Inbox />
    </SheetManagerProvider>
  );
}
`;

const replaceExample = `"use client";

import { useSheetManager } from "@/components/sheet-manager";

export function EditFlow() {
  const sheets = useSheetManager();

  return (
    <button
      type="button"
      onClick={() => {
        const handle = sheets.open({
          title: "Edit profile",
          content: ({ close }) => (
            <button
              type="button"
              onClick={() => {
                void sheets.replace(handle.id, {
                  title: "Saved",
                  content: ({ close: closeSaved }) => (
                    <button
                      type="button"
                      onClick={() => closeSaved("submitted")}
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

const nestedExample = `"use client";

import { useSheetManager } from "@/components/sheet-manager";

export function NestedFilters() {
  const sheets = useSheetManager();

  return (
    <button
      type="button"
      onClick={() => {
        void sheets.open({
          title: "Filters",
          content: ({ close }) => (
            <div>
              <button
                type="button"
                onClick={() => {
                  void sheets.open({
                    nested: true,
                    title: "Date range",
                    side: "right",
                    content: ({ close: closeNested }) => (
                      <button type="button" onClick={() => closeNested()}>
                        Close range
                      </button>
                    ),
                  });
                }}
              >
                Date range
              </button>
              <button type="button" onClick={() => close()}>
                Close
              </button>
            </div>
          ),
        });
      }}
    >
      Open filters
    </button>
  );
}
`;

const composeExample = `"use client";

import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "@/components/modal-manager-provider";
import {
  SheetManager,
  SheetManagerProvider,
  useSheetManager,
} from "@/components/sheet-manager";

function Compose() {
  const modals = useModalManager();
  const sheets = useSheetManager();

  return (
    <button
      type="button"
      onClick={() => {
        void modals.open({
          title: "Account",
          content: ({ close }) => (
            <div>
              <button
                type="button"
                onClick={() => {
                  void sheets.open({
                    title: "Filters",
                    content: ({ close: closeSheet }) => (
                      <button type="button" onClick={() => closeSheet()}>
                        Close sheet
                      </button>
                    ),
                  });
                }}
              >
                Open sheet
              </button>
              <button type="button" onClick={() => close()}>
                Close account
              </button>
            </div>
          ),
        });
      }}
    >
      Open account
    </button>
  );
}

export function App() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SheetManagerProvider>
          <SheetManager />
          <Compose />
        </SheetManagerProvider>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
} from "@/components/modal-manager-provider";
import {
  SheetManager,
  SheetManagerProvider,
} from "@/components/sheet-manager";

function App() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SheetManagerProvider>
          <SheetManager />
          <main>App</main>
        </SheetManagerProvider>
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
import {
  SheetManager,
  SheetManagerProvider,
} from "@/components/sheet-manager";

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
            <SheetManagerProvider>
              <SheetManager />
              {children}
            </SheetManagerProvider>
          </ModalManagerProvider>
        </OverlayLayerProvider>
      </body>
    </html>
  );
}
`;

export const sheetManagerDocs: CompleteDocSlots = {
  preview: <SheetManagerPreview />,
  examples: [
    { label: "open.tsx", language: "tsx", code: stackExample },
    { label: "replace.tsx", language: "tsx", code: replaceExample },
    { label: "nested.tsx", language: "tsx", code: nestedExample },
    { label: "compose-modal.tsx", language: "tsx", code: composeExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">SheetSettlement</dt>
      <dd>
        Distinct sheet union: <code>submitted</code> | <code>cancelled</code> |{" "}
        <code>dismissed</code>. It does not reuse modal-manager{" "}
        <code>OverlaySettlement</code> (<code>confirmed</code>). Escape,
        backdrop, programmatic close, and provider teardown settle as{" "}
        <code>dismissed</code>.
      </dd>
      <dt className="mono">SheetManagerProvider / SheetManager</dt>
      <dd>
        Client-only LIFO overlay layer, separate from the modal stack. Place{" "}
        <code>OverlayLayerProvider</code> around both hosts. Nested providers
        stay isolated. If the layer provider is missing, the sheet provider
        wraps itself. Sheet operations never close or mutate modal entries.
      </dd>
      <dt className="mono">useSheetManager()</dt>
      <dd>
        <code>open</code>, <code>replace(id, next)</code>,{" "}
        <code>close(id)</code>, <code>closeAll</code>,{" "}
        <code>setPending(id, pending)</code>. Each open returns{" "}
        <code>{`{ id, result }`}</code> where <code>result</code> is a promise
        for <code>SheetSettlement</code>. Default is one active sheet per scope;{" "}
        <code>nested: true</code> stacks LIFO. <code>replace</code> keeps the
        stack slot. Invalid ids and cross-scope operations reject. Pre-hydration
        calls are no-ops with a development warning.
      </dd>
      <dt className="mono">side / modal / pending</dt>
      <dd>
        Sides: <code>top</code>, <code>right</code> (default),{" "}
        <code>bottom</code>, <code>left</code>. Pass a function for a
        caller-owned breakpoint policy; <code>liveSide</code> re-evaluates on
        resize without remounting. <code>modal</code> defaults on.{" "}
        <code>pending</code> disables configured dismissal and sets{" "}
        <code>aria-busy</code>. Escape defaults on; backdrop defaults on for
        non-destructive sheets.
      </dd>
      <dt className="mono">Overlay composition</dt>
      <dd>
        Registers as kind <code>sheet</code> with the Overlay Layer Registry
        owned by <code>@app-kit/modal-manager</code>. Opening a sheet over a
        modal leaves the modal mounted and inert; escape closes the sheet only.
        Opening a modal over a sheet suspends the sheet stack. Closing the
        foreground restores the next layer.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place the providers but must not call sheet operations. Pre-hydration open/replace/close is a no-op.",
    "Modal and sheet stacks stay separate. Sheets register as overlay layers; they must not nest inside Dialog.",
    "One active sheet per scope by default. Pass nested: true to stack.",
    "Sheet content may hold callbacks and React nodes. It is not JSON-serializable.",
    "Manual-copy fallback: copy infra/sheet-manager.tsx to src/components/sheet-manager.tsx. Install @app-kit/modal-manager and the shadcn sheet primitive first.",
  ],
};
