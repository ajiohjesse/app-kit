import type { CompleteDocSlots } from "./complete-docs";
import { ConfirmDialogPreview } from "./confirm-dialog-preview";

const booleanExample = `"use client";

import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function LeaveGuard() {
  const { confirm } = useConfirmDialog();

  return (
    <button
      type="button"
      onClick={async () => {
        const settlement = await confirm({
          title: "Leave this page?",
          description: "Unsaved edits will be lost.",
        });
        if (settlement !== "confirmed") return;
        window.location.assign("/inbox");
      }}
    >
      Leave
    </button>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <LeaveGuard />
    </ModalManagerProvider>
  );
}
`;

const runExample = `"use client";

import { ActionRunnerProvider } from "@/components/action-runner";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function DeleteFileButton({ id }: { id: string }) {
  const { confirmAndRun } = useConfirmDialog();

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirmAndRun({
          title: "Delete file?",
          description: "This cannot be undone.",
          confirmLabel: "Delete",
          destructive: true,
          onConfirm: async () => {
            await deleteFile(id);
            return id;
          },
        });
        if (result.status !== "confirmed") return;
      }}
    >
      Delete
    </button>
  );
}

export function App({ id }: { id: string }) {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <ConfirmDialogProvider>
        <ActionRunnerProvider>
          <DeleteFileButton id={id} />
        </ActionRunnerProvider>
      </ConfirmDialogProvider>
    </ModalManagerProvider>
  );
}

async function deleteFile(_id: string) {}
`;

const errorExample = `"use client";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { useActionRunner } from "@/components/action-runner";

export function PublishButton() {
  const { confirmAndRun } = useConfirmDialog();
  const { state } = useActionRunner();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void confirmAndRun({
            title: "Publish now?",
            onLogError: (error) => {
              console.error(error);
            },
            onError: (classified) => {
              reportSafe(classified.messageKey);
            },
            onConfirm: async () => {
              await publish();
            },
          });
        }}
      >
        Publish
      </button>
      {state.error ? <p role="alert">{state.error.message}</p> : null}
    </div>
  );
}

async function publish() {}
function reportSafe(_key: string) {}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function Toolbar() {
  const { confirm } = useConfirmDialog();
  return (
    <button
      type="button"
      onClick={() => {
        void confirm({ title: "Reset demo?" });
      }}
    >
      Reset
    </button>
  );
}

function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <Toolbar />
    </ModalManagerProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextActionRecipe = `"use client";

import { useConfirmDialog } from "@/components/confirm-dialog";
import { deleteFile } from "./actions";

export function DeleteButton({ id }: { id: string }) {
  const { confirmAndRun } = useConfirmDialog();

  return (
    <button
      type="button"
      onClick={() => {
        void confirmAndRun({
          title: "Delete file?",
          onConfirm: async () => {
            await deleteFile(id);
          },
        });
      }}
    >
      Delete
    </button>
  );
}
`;

const nextActionsModule = `"use server";

export async function deleteFile(id: string) {
  await dbDelete(id);
}

async function dbDelete(_id: string) {}
`;

const nextRecipe = `import type { ReactNode } from "react";
import { ActionRunnerProvider } from "@/components/action-runner";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ModalManagerProvider>
          <ModalManager />
          <ConfirmDialogProvider>
            <ActionRunnerProvider>{children}</ActionRunnerProvider>
          </ConfirmDialogProvider>
        </ModalManagerProvider>
      </body>
    </html>
  );
}
`;

export const confirmDialogDocs: CompleteDocSlots = {
  preview: <ConfirmDialogPreview />,
  examples: [
    { label: "boolean-confirm.tsx", language: "tsx", code: booleanExample },
    { label: "confirm-and-run.tsx", language: "tsx", code: runExample },
    { label: "error-path.tsx", language: "tsx", code: errorExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "layout.tsx", language: "tsx", code: nextRecipe },
    { label: "server-action.tsx", language: "tsx", code: nextActionRecipe },
    { label: "actions.ts", language: "typescript", code: nextActionsModule },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">ConfirmDialogProvider</dt>
      <dd>
        Optional ancestor that publishes the default ActionConfirmAdapter for
        Action runner. Still requires <code>ModalManagerProvider</code> and a{" "}
        <code>ModalManager</code> host.
      </dd>
      <dt className="mono">useConfirmDialog()</dt>
      <dd>
        Client hook over modal-manager. <code>confirm()</code> works with
        modal-manager alone. <code>confirmAndRun()</code> requires an{" "}
        <code>ActionRunnerProvider</code> ancestor.
      </dd>
      <dt className="mono">confirm(options)</dt>
      <dd>
        Opens an <code>alert-dialog</code> entry and returns{" "}
        <code>OverlaySettlement</code>: <code>confirmed</code> |{" "}
        <code>cancelled</code> | <code>dismissed</code>. Title is required;
        description is optional. <code>destructive</code> is explicit metadata,
        never inferred from labels.
      </dd>
      <dt className="mono">confirmAndRun(options)</dt>
      <dd>
        Thin call into Action runner <code>run</code> with{" "}
        <code>options.confirm</code> (and optional <code>blocking</code>).
        Resolves <code>{`{ status: "confirmed"; data }`}</code>,{" "}
        <code>cancelled</code>, or{" "}
        <code>{`{ status: "error"; error: ErrorClassification }`}</code>.
        Optional <code>onValidate</code> runs first and skips the action when it
        returns an error. Abort, timeout, and classification live in Action
        runner — not here.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place ModalManagerProvider but must not call confirm().",
    "Confirm always opens a modal-manager alert-dialog entry. Do not mount a second overlay layer.",
    "No built-in toast. Wire onSuccess / onError / onLogError to your notifier.",
    "confirmAndRun requires @app-kit/action-runner. Standalone confirm() does not.",
    "Server Actions are supported only as an async function passed to onConfirm. No direct Next.js import.",
    "Manual-copy fallback: copy infra/confirm-dialog.tsx to src/components/confirm-dialog.tsx. Install @app-kit/modal-manager, @app-kit/action-runner, and @app-kit/error-classification first.",
  ],
};
