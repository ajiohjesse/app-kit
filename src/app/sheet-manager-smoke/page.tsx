"use client";

import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "../../../infra/modal-manager-provider";
import {
  SheetManager,
  SheetManagerProvider,
  useSheetManager,
} from "../../../infra/sheet-manager";

function SmokeBody() {
  const modals = useModalManager();
  const sheets = useSheetManager();

  return (
    <main>
      <h1>sheet-manager smoke</h1>
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
                    void sheets.open({
                      title: "Filters",
                      content: ({ close: closeSheet }) => (
                        <div>
                          <p>Filters body</p>
                          <button type="button" onClick={() => closeSheet()}>
                            Close sheet
                          </button>
                        </div>
                      ),
                    });
                  }}
                >
                  Open sheet
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
    </main>
  );
}

export default function SheetManagerSmokePage() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SheetManagerProvider>
          <SheetManager />
          <SmokeBody />
        </SheetManagerProvider>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
