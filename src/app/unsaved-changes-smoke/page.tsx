"use client";

import { useMemo, useState } from "react";
import { useConfirmDialog } from "../../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";
import { useUnsavedChanges } from "../../../infra/unsaved-changes-provider";

function SmokeBody() {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);
  const [note, setNote] = useState("");
  const [lastOutcome, setLastOutcome] = useState("none");
  const [navCount, setNavCount] = useState(0);
  const [beforeUnloadBound, setBeforeUnloadBound] = useState(false);

  const { isDirty, markDirty, markClean, attemptNavigation } =
    useUnsavedChanges({
      confirm: confirmAdapter,
      navigate: async () => {
        setNavCount((count) => count + 1);
      },
    });

  return (
    <main>
      <h1>unsaved-changes smoke</h1>
      <label>
        note
        <input
          aria-label="note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            markDirty();
          }}
        />
      </label>
      <button type="button" onClick={() => markClean()}>
        Mark clean
      </button>
      <button
        type="button"
        onClick={() => {
          void attemptNavigation({ href: "/inbox" }).then((outcome) => {
            setLastOutcome(outcome);
          });
        }}
      >
        Leave
      </button>
      <button
        type="button"
        onClick={() => {
          const event = new Event("beforeunload", {
            cancelable: true,
          }) as BeforeUnloadEvent;
          Object.defineProperty(event, "returnValue", {
            writable: true,
            value: undefined,
          });
          window.dispatchEvent(event);
          setBeforeUnloadBound(event.defaultPrevented);
        }}
      >
        Probe beforeunload
      </button>
      <p>dirty:{isDirty ? "yes" : "no"}</p>
      <p>outcome:{lastOutcome}</p>
      <p>navCount:{navCount}</p>
      <p>beforeUnloadBound:{beforeUnloadBound ? "yes" : "no"}</p>
    </main>
  );
}

export default function UnsavedChangesSmokePage() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <SmokeBody />
    </ModalManagerProvider>
  );
}
