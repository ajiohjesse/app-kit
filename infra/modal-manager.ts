export type OverlaySettlement = "confirmed" | "cancelled" | "dismissed";

export type OverlayLayerKind = "sheet" | "modal" | "loading";

export type ModalSurface = "dialog" | "alert-dialog";

export type OverlayLayerRegistration = {
  id: string;
  kind: OverlayLayerKind;
  scope?: string;
  getRestoreTarget: () => Element | null;
  onSuspend: () => void;
  onResume: () => void;
};
