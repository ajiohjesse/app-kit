"use client";

import { useState } from "react";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
} from "../../../infra/loading-overlay";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "../../../infra/modal-manager-provider";

function BlockingSmoke() {
  const overlay = useLoadingOverlay();
  const modals = useModalManager();

  return (
    <div>
      <h2>blocking</h2>
      <button
        type="button"
        onClick={() => {
          void modals.open({
            title: "Account",
            content: ({ close }) => (
              <div>
                <p>Account body</p>
                <button
                  type="button"
                  onClick={() => {
                    overlay.fail(overlay.begin({ label: "Saving" }), {
                      message: "Saving",
                    });
                  }}
                >
                  Show blocking overlay
                </button>
                <button type="button" onClick={() => close()}>
                  Close account
                </button>
              </div>
            ),
          });
        }}
      >
        Open account
      </button>
      <LoadingOverlay />
    </div>
  );
}

function NonBlockingSmoke() {
  const overlay = useLoadingOverlay();
  const [notes, setNotes] = useState("");

  return (
    <div>
      <h2>non-blocking</h2>
      <button
        type="button"
        onClick={() => {
          const token = overlay.begin({ label: "Syncing" });
          window.setTimeout(() => overlay.release(token), 1500);
        }}
      >
        Show non-blocking overlay
      </button>
      <label>
        note
        <input
          aria-label="note"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <p>Page content stays interactive.</p>
      <LoadingOverlay />
    </div>
  );
}

export default function LoadingOverlaySmokePage() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <main>
          <h1>loading-overlay smoke</h1>
          <LoadingOverlayProvider errorDurationMs={1000}>
            <BlockingSmoke />
          </LoadingOverlayProvider>
          <LoadingOverlayProvider scope="panel" blocking={false}>
            <NonBlockingSmoke />
          </LoadingOverlayProvider>
        </main>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
