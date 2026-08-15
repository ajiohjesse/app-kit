"use client";

import { useState } from "react";
import { useDraftAutosave } from "../../infra/draft-autosave-provider";
import { createMemoryDraftStore } from "../../infra/draft-autosave";

const store = createMemoryDraftStore();

export function DraftAutosavePreview() {
  const { state, update, flush, restore, discard } = useDraftAutosave({
    draftId: "preview-form",
    schemaVersion: "v1",
    store,
    debounceMs: 200,
    restoreOnMount: false,
  });
  const [title, setTitle] = useState("");

  return (
    <div className="usage-sketch">
      <p>Debounced draft save. Explicit restore and discard.</p>
      <label>
        Title
        <input
          aria-label="title"
          value={title}
          onChange={(event) => {
            const next = event.target.value;
            setTitle(next);
            update({ title: next });
          }}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => void flush()}>
          Flush
        </button>
        <button
          type="button"
          onClick={() => {
            void restore().then((result) => {
              if (result.status === "restored") {
                setTitle(
                  String(
                    (result.record.payload as { title?: string }).title ?? ""
                  )
                );
              }
            });
          }}
        >
          Restore
        </button>
        <button
          type="button"
          onClick={() => {
            void discard().then(() => setTitle(""));
          }}
        >
          Discard
        </button>
      </div>
      <p>
        Lifecycle: <span className="mono">{state.lifecycle}</span> · rev{" "}
        <span className="mono">{state.revision}</span>
      </p>
    </div>
  );
}
