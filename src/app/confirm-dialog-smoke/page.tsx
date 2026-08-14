"use client";

import { useConfirmDialog } from "../../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";

function SmokeBody() {
  const { confirm, confirmAndRun } = useConfirmDialog();

  return (
    <main>
      <h1>confirm-dialog smoke</h1>
      <button
        type="button"
        onClick={() => {
          void confirm({
            title: "Delete file?",
            description: "This cannot be undone.",
            confirmLabel: "Delete",
            destructive: true,
          });
        }}
      >
        Open confirm
      </button>
      <button
        type="button"
        onClick={() => {
          void confirmAndRun({
            title: "Save draft?",
            onConfirm: async () => "saved",
          });
        }}
      >
        Open confirm and run
      </button>
    </main>
  );
}

export default function ConfirmDialogSmokePage() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <SmokeBody />
    </ModalManagerProvider>
  );
}
