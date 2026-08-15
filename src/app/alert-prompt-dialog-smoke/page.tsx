"use client";

import { useAlertPromptDialog } from "../../../infra/alert-prompt-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";

function SmokeBody() {
  const { alert, prompt } = useAlertPromptDialog();

  return (
    <main>
      <h1>alert-prompt-dialog smoke</h1>
      <button
        type="button"
        onClick={() => {
          void alert({
            title: "Saved",
            description: "Your draft is stored in this tab.",
          });
        }}
      >
        Open alert
      </button>
      <button
        type="button"
        onClick={() => {
          void prompt({
            title: "Rename file",
            label: "File name",
            defaultValue: "notes.md",
          });
        }}
      >
        Open prompt
      </button>
    </main>
  );
}

export default function AlertPromptDialogSmokePage() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <SmokeBody />
    </ModalManagerProvider>
  );
}
