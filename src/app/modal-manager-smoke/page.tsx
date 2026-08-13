"use client";

import { useRef } from "react";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
  useOverlayLayer,
} from "../../../infra/modal-manager-provider";

function SmokeBody() {
  const modals = useModalManager();
  const overlay = useOverlayLayer();
  const loadingRegistered = useRef(false);

  return (
    <main>
      <h1>modal-manager smoke</h1>
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
                    void modals.open({
                      title: "Confirm email",
                      content: ({ close: closeNested }) => (
                        <button type="button" onClick={() => closeNested()}>
                          Close nested
                        </button>
                      ),
                    });
                  }}
                >
                  Open nested
                </button>
                <button type="button" onClick={() => close()}>
                  Close account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!loadingRegistered.current) {
                      overlay.registerLayer({
                        id: "loading-smoke",
                        kind: "loading",
                        getRestoreTarget: () => null,
                        onSuspend: () => {},
                        onResume: () => {},
                      });
                      loadingRegistered.current = true;
                    }
                    overlay.setForeground("loading-smoke");
                  }}
                >
                  Suspend stack
                </button>
              </div>
            ),
          });
        }}
      >
        Open account
      </button>
      <button
        type="button"
        onClick={() => {
          void modals.open({
            surface: "alert-dialog",
            title: "Delete file?",
            content: ({ confirm, cancel }) => (
              <div>
                <button type="button" onClick={() => cancel()}>
                  Keep
                </button>
                <button type="button" onClick={() => confirm()}>
                  Delete
                </button>
              </div>
            ),
          });
        }}
      >
        Open confirm
      </button>
    </main>
  );
}

export default function ModalManagerSmokePage() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SmokeBody />
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
