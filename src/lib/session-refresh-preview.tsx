"use client";

import { useState } from "react";
import {
  SessionRefreshProvider,
  useSessionRefresh,
} from "../../infra/session-refresh-provider";
import { AuthExpiredError } from "../../infra/session-refresh";
import type { Session } from "../../infra/authentication-core";

const liveSession: Session = {
  user: { id: "user-1", name: "Ada Lovelace" },
  expiresAt: "2030-01-01T00:00:00.000Z",
  sessionId: "sess-1",
};

function PreviewBody() {
  const { refresh, intercept } = useSessionRefresh();
  const [result, setResult] = useState("idle");

  return (
    <div className="usage-sketch">
      <p>Single-flight refresh coordinator. Reads may replay once.</p>
      <button
        type="button"
        onClick={() => {
          void refresh().then((outcome) => setResult(outcome.status));
        }}
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => {
          let attempts = 0;
          void intercept(
            async () => {
              attempts += 1;
              if (attempts === 1) {
                throw new AuthExpiredError();
              }
              return "recovered";
            },
            { replayPolicy: "read" }
          ).then((outcome) =>
            setResult(outcome.status === "ok" ? outcome.value : outcome.status)
          );
        }}
      >
        Recover read
      </button>
      <p>
        Result: <span className="mono">{result}</span>
      </p>
    </div>
  );
}

export function SessionRefreshPreview() {
  return (
    <SessionRefreshProvider
      session={liveSession}
      refresh={async () => liveSession}
    >
      <PreviewBody />
    </SessionRefreshProvider>
  );
}
