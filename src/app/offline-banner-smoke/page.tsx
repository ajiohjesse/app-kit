"use client";

import { useState } from "react";
import {
  ConnectivityProvider,
  OfflineBanner,
  useConnectivity,
} from "../../../infra/offline-banner";

function SmokeBody() {
  const { state } = useConnectivity();
  const [notes, setNotes] = useState("");

  return (
    <main>
      <h1>offline-banner smoke</h1>
      <OfflineBanner />
      <p>state: {state}</p>
      <label>
        note
        <input
          aria-label="note"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <p id="page-copy">Page content stays interactive.</p>
    </main>
  );
}

export default function OfflineBannerSmokePage() {
  return (
    <ConnectivityProvider>
      <SmokeBody />
    </ConnectivityProvider>
  );
}
