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

import { useConfirmDialog } from "@/components/confirm-dialog";

export function DeleteFileButton({ id }: { id: string }) {
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

async function deleteFile(_id: string) {}
`;

const errorExample = `"use client";

import { useConfirmDialog } from "@/components/confirm-dialog";

export function PublishButton() {
  const { confirmAndRun } = useConfirmDialog();

  return (
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
          {children}
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
      <dt className="mono">useConfirmDialog()</dt>
      <dd>
        Client hook over modal-manager. Requires{" "}
        <code>ModalManagerProvider</code> and a <code>ModalManager</code> host.
        This item does not mount a second overlay layer.
      </dd>
      <dt className="mono">confirm(options)</dt>
      <dd>
        Opens an <code>alert-dialog</code> entry and returns{" "}
        <code>OverlaySettlement</code> from <code>@lib/modal-manager</code>:{" "}
        <code>confirmed</code> | <code>cancelled</code> | <code>dismissed</code>
        . Cancel and dismiss never count as confirmation. Title is required;
        description is optional. <code>destructive</code> is explicit metadata,
        never inferred from labels.
      </dd>
      <dt className="mono">confirmAndRun(options)</dt>
      <dd>
        Same surface, then runs <code>onConfirm</code> while the dialog stays
        open. Resolves <code>{`{ status: "confirmed"; data }`}</code>,{" "}
        <code>cancelled</code>, <code>dismissed</code>, or{" "}
        <code>{`{ status: "error"; error: ErrorClassification }`}</code>. Cancel
        is disabled while pending unless <code>abortable</code>. Mutation
        dialogs keep escape off so pending work cannot be dismissed by keyboard.
        Retry reuses the same modal entry. Optional <code>onValidate</code> runs
        first and skips <code>onConfirm</code> when it returns an error.
      </dd>
      <dt className="mono">ErrorClassification</dt>
      <dd>
        Owned by <code>@lib/error-classification</code>. Mutation failures stay
        in place with retry and cancel. Raw exception text is never rendered.
        Pass raw errors to <code>onLogError</code>. Optional{" "}
        <code>classifiers</code> and <code>actionRunner.run</code> may be
        injected; this item has no circular dependency on action-runner.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place ModalManagerProvider but must not call confirm().",
    "Confirm always opens a modal-manager alert-dialog entry. Do not mount a second overlay layer.",
    "No built-in toast. Wire onSuccess / onError / onLogError to your notifier.",
    "Server Actions are supported only as an async function passed to onConfirm. No direct Next.js import.",
    "Manual-copy fallback: copy infra/confirm-dialog.tsx to src/components/confirm-dialog.tsx. Install @app-kit/modal-manager and @app-kit/error-classification first.",
  ],
};
