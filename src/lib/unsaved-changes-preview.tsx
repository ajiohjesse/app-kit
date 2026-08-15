"use client";

import { useMemo, useState } from "react";
import { useConfirmDialog } from "../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";
import { useUnsavedChanges } from "../../infra/unsaved-changes-provider";

function PreviewBody() {
  const { confirm } = useConfirmDialog();
  const [note, setNote] = useState("");
  const [log, setLog] = useState("idle");
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  const { isDirty, markDirty, markClean, attemptNavigation } =
    useUnsavedChanges({
      confirm: confirmAdapter,
      navigate: async (intent) => {
        setLog(`navigated:${intent.href}`);
      },
    });

  return (
    <div className="usage-sketch">
      <p>Dirty flag is consumer-owned. Leave uses confirm-dialog once.</p>
      <label>
        Note
        <input
          aria-label="note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            markDirty();
          }}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => markClean()}>
          Mark clean
        </button>
        <button
          type="button"
          onClick={() => {
            void attemptNavigation({ href: "/inbox" }).then((outcome) => {
              setLog(`outcome:${outcome}`);
            });
          }}
        >
          Leave to inbox
        </button>
      </div>
      <p>dirty:{isDirty ? "yes" : "no"}</p>
      <p>{log}</p>
    </div>
  );
}

export function UnsavedChangesPreview() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <PreviewBody />
    </ModalManagerProvider>
  );
}
