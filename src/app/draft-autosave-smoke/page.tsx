"use client";

import { useState } from "react";
import { createSessionStorageDraftStore } from "../../../infra/draft-autosave";
import { useDraftAutosave } from "../../../infra/draft-autosave-provider";

const store = createSessionStorageDraftStore({
  storage: typeof sessionStorage === "undefined" ? undefined : sessionStorage,
});

function countDraftKeys(): number {
  if (typeof sessionStorage === "undefined") {
    return 0;
  }
  const prefix = "app-kit:draft-autosave:";
  let count = 0;
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      count += 1;
    }
  }
  return count;
}

function SmokeBody() {
  const { state, update, flush, restore, discard } = useDraftAutosave({
    draftId: "smoke-form",
    schemaVersion: "v1",
    store,
    debounceMs: 50,
    restoreOnMount: false,
  });
  const [title, setTitle] = useState("");
  const storageKeyCount = countDraftKeys();

  return (
    <main>
      <h1>draft-autosave smoke</h1>
      <label>
        title
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
      <button type="button" onClick={() => void flush()}>
        Flush
      </button>
      <button
        type="button"
        onClick={() => {
          void restore().then((result) => {
            if (result.status === "restored") {
              const payload = result.record.payload as { title?: string };
              setTitle(payload.title ?? "");
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
      <p>lifecycle:{state.lifecycle}</p>
      <p>revision:{state.revision}</p>
      <p>namespace:{state.namespace}</p>
      <p>storageKeys:{storageKeyCount}</p>
      <p>titleValue:{title}</p>
    </main>
  );
}

export default function DraftAutosaveSmokePage() {
  return <SmokeBody />;
}
