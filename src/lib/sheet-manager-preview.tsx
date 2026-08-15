"use client";

import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "../../infra/modal-manager-provider";
import {
  SheetManager,
  SheetManagerProvider,
  useSheetManager,
} from "../../infra/sheet-manager";

function PreviewBody() {
  const sheets = useSheetManager();
  const modals = useModalManager();

  return (
    <div className="usage-sketch">
      <p>
        Separate LIFO sheet stack. Opening a sheet over a modal leaves the modal
        mounted and inert.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void sheets.open({
              title: "Filters",
              content: ({ close, submit }) => (
                <div className="flex flex-col gap-2">
                  <p>Sheet body. Escape dismisses this sheet only.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => submit()}>
                      Apply
                    </button>
                    <button type="button" onClick={() => close()}>
                      Close
                    </button>
                  </div>
                </div>
              ),
            });
          }}
        >
          Open sheet
        </button>
        <button
          type="button"
          onClick={() => {
            void modals.open({
              title: "Account",
              content: ({ close }) => (
                <div className="flex flex-col gap-2">
                  <p>Modal stays mounted while the sheet is foreground.</p>
                  <button
                    type="button"
                    onClick={() => {
                      void sheets.open({
                        title: "Filters",
                        content: ({ close: closeSheet }) => (
                          <button type="button" onClick={() => closeSheet()}>
                            Close sheet
                          </button>
                        ),
                      });
                    }}
                  >
                    Open sheet over modal
                  </button>
                  <button type="button" onClick={() => close()}>
                    Close account
                  </button>
                </div>
              ),
            });
          }}
        >
          Open modal then sheet
        </button>
      </div>
    </div>
  );
}

export function SheetManagerPreview() {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SheetManagerProvider>
          <SheetManager />
          <PreviewBody />
        </SheetManagerProvider>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}
