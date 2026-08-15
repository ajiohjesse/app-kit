"use client";

import { useState } from "react";
import { useAlertPromptDialog } from "../../infra/alert-prompt-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";

function PreviewBody() {
  const { alert, prompt } = useAlertPromptDialog();
  const [last, setLast] = useState("idle");

  function recordPrompt(
    value: { status: "submitted"; value: string } | { status: "dismissed" }
  ) {
    setLast(value.status === "submitted" ? value.value : value.status);
  }

  return (
    <div className="usage-sketch">
      <p>
        Last result: <span className="mono">{last}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void alert({
              title: "Saved",
              description: "Your draft is stored in this tab.",
            }).then((value) => setLast(value));
          }}
        >
          Alert
        </button>
        <button
          type="button"
          onClick={() => {
            void prompt({
              title: "Rename file",
              label: "File name",
              defaultValue: "notes.md",
            }).then(recordPrompt);
          }}
        >
          Prompt
        </button>
        <button
          type="button"
          onClick={() => {
            void prompt({
              title: "Team name",
              label: "Name",
              validate: (value) => {
                if (!value.trim()) {
                  return { error: "Name is required." };
                }
              },
            }).then(recordPrompt);
          }}
        >
          Validate
        </button>
      </div>
    </div>
  );
}

export function AlertPromptDialogPreview() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <PreviewBody />
    </ModalManagerProvider>
  );
}
