"use client";

import { useRef } from "react";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
  type LoadingOverlayToken,
} from "../../infra/loading-overlay";

function PreviewBody() {
  const overlay = useLoadingOverlay();
  const tokenRef = useRef<LoadingOverlayToken | null>(null);

  return (
    <div className="usage-sketch">
      <p>
        Status: <span className="mono">{overlay.status || "idle"}</span>
        {overlay.progress != null
          ? ` · ${Math.round(overlay.progress * 100)}%`
          : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            tokenRef.current = overlay.begin({ label: "Saving" });
          }}
        >
          Begin
        </button>
        <button
          type="button"
          onClick={() => {
            if (tokenRef.current) {
              overlay.succeed(tokenRef.current);
            }
          }}
        >
          Succeed
        </button>
        <button
          type="button"
          onClick={() => {
            if (tokenRef.current) {
              overlay.fail(tokenRef.current, { message: "Save failed" });
            }
          }}
        >
          Fail
        </button>
        <button
          type="button"
          onClick={() => {
            if (tokenRef.current) {
              overlay.release(tokenRef.current);
            }
          }}
        >
          Release
        </button>
      </div>
      <LoadingOverlay />
    </div>
  );
}

export function LoadingOverlayPreview() {
  return (
    <LoadingOverlayProvider
      scope="preview"
      blocking={false}
      successDurationMs={800}
      errorDurationMs={800}
    >
      <PreviewBody />
    </LoadingOverlayProvider>
  );
}
