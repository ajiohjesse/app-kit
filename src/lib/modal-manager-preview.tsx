"use client";

import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "../../infra/modal-manager-provider";

function PreviewBody() {
  const modals = useModalManager();

  return (
    <div className="usage-sketch">
      <p>LIFO stack. Nested Dialog trees, not sibling portals.</p>
      <button
        type="button"
        onClick={() => {
          const account = modals.open({
            title: "Account",
            content: ({ close }) => (
              <div className="flex flex-col gap-2">
                <p>Lower modal stays mounted while the next one stacks.</p>
                <button
                  type="button"
                  onClick={() => {
                    void modals.replace(account.id, {
                      title: "Profile saved",
                      content: ({ close: closeReplaced }) => (
                        <button
                          type="button"
                          onClick={() => closeReplaced("confirmed")}
                        >
                          Done
                        </button>
                      ),
                    });
                  }}
                >
                  Replace with success
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void modals.open({
                      surface: "alert-dialog",
                      title: "Delete account?",
                      content: ({ confirm, cancel }) => (
                        <div className="flex gap-2">
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
                  Stack alert-dialog
                </button>
                <button type="button" onClick={() => close()}>
                  Close
                </button>
              </div>
            ),
          });
        }}
      >
        Open stacked modal
      </button>
    </div>
  );
}

export function ModalManagerPreview() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <PreviewBody />
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
