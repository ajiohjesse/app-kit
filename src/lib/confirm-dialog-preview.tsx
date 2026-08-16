"use client";

import { useState } from "react";
import { ActionRunnerProvider } from "../../infra/action-runner";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";

function PreviewBody() {
  const { confirm, confirmAndRun } = useConfirmDialog();
  const [last, setLast] = useState("idle");

  return (
    <div className="usage-sketch">
      <p>
        Last result: <span className="mono">{last}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void confirm({
              title: "Leave this page?",
              description: "Unsaved edits will be lost.",
            }).then((value) => setLast(value));
          }}
        >
          Boolean confirm
        </button>
        <button
          type="button"
          onClick={() => {
            void confirmAndRun({
              title: "Save draft?",
              onConfirm: async () => "saved",
            }).then((value) => setLast(value.status));
          }}
        >
          Confirm and run
        </button>
        <button
          type="button"
          onClick={() => {
            void confirmAndRun({
              title: "Publish?",
              onLogError: () => {},
              onConfirm: async () => {
                throw new Error("upstream exploded");
              },
            }).then((value) => setLast(value.status));
          }}
        >
          Error path
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialogPreview() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <ConfirmDialogProvider>
        <ActionRunnerProvider>
          <PreviewBody />
        </ActionRunnerProvider>
      </ConfirmDialogProvider>
    </ModalManagerProvider>
  );
}
