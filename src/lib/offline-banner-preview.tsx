"use client";

import {
  ConnectivityProvider,
  OfflineBanner,
  useConnectivity,
  type ReachabilityProbe,
} from "../../infra/offline-banner";

const previewProbe: ReachabilityProbe = async () => {
  throw new Error("docs preview forces an offline snapshot");
};

function PreviewState() {
  const { state } = useConnectivity();
  return (
    <p>
      Connectivity state: <span className="mono">{state}</span>
    </p>
  );
}

export function OfflineBannerPreview() {
  return (
    <ConnectivityProvider probe={previewProbe} failureThreshold={1}>
      <div className="usage-sketch">
        <OfflineBanner />
        <PreviewState />
        <p>
          Status chrome only. This preview uses a failing reachability probe so
          the banner is visible while you are online.
        </p>
      </div>
    </ConnectivityProvider>
  );
}
