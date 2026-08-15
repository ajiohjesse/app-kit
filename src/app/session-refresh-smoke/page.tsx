"use client";

import { useState } from "react";
import {
  SessionRefreshProvider,
  useSessionRefresh,
} from "../../../infra/session-refresh-provider";
import { AuthExpiredError } from "../../../infra/session-refresh";
import type { Session } from "../../../infra/authentication-core";

const baseSession: Session = {
  user: { id: "user-1", name: "Test User" },
  expiresAt: "2030-01-01T00:00:00.000Z",
  sessionId: "sess-1",
};

function SmokeBody({ refreshCount }: { refreshCount: number }) {
  const { refresh, intercept } = useSessionRefresh();
  const [result, setResult] = useState("idle");

  return (
    <div>
      <h1>Test User</h1>
      <p>refreshCount:{refreshCount}</p>
      <p>result:{result}</p>
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
              return "ok";
            },
            { replayPolicy: "read" }
          ).then((outcome) =>
            setResult(outcome.status === "ok" ? outcome.value : outcome.status)
          );
        }}
      >
        Recover read
      </button>
    </div>
  );
}

export default function SessionRefreshSmokePage() {
  const [refreshCount, setRefreshCount] = useState(0);

  return (
    <SessionRefreshProvider
      session={baseSession}
      refresh={async () => {
        setRefreshCount((count) => count + 1);
        return baseSession;
      }}
    >
      <SmokeBody refreshCount={refreshCount} />
    </SessionRefreshProvider>
  );
}
