"use client";

import { useState } from "react";
import {
  PendingAuthActionProvider,
  usePendingAuthAction,
} from "../../infra/pending-auth-action-provider";
import {
  createMemoryPendingActionStore,
  type ResumeResult,
} from "../../infra/pending-auth-action";

const session = {
  user: { id: "user-1", name: "Ada Lovelace" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function PreviewBody() {
  const { registerIntent, registerHandler, resume } = usePendingAuthAction();
  const [result, setResult] = useState<string>("idle");

  return (
    <div className="usage-sketch">
      <p>Tab-local pending intents. Handlers stay in memory.</p>
      <button
        type="button"
        onClick={() => {
          registerHandler("open-invoice", async () => ({
            status: "succeeded",
          }));
          void (async () => {
            const intent = await registerIntent({
              kind: "open-invoice",
              version: 1,
              payload: { invoiceId: "inv-1" },
              returnTo: "/invoices/inv-1",
              idempotencyKey: "open-inv-1",
              replayPolicy: "read",
            });
            const outcome: ResumeResult = await resume({ intentId: intent.id });
            setResult(outcome.status);
          })();
        }}
      >
        Register + resume
      </button>
      <p>
        Result: <span className="mono">{result}</span>
      </p>
    </div>
  );
}

export function PendingAuthActionPreview() {
  return (
    <PendingAuthActionProvider
      store={createMemoryPendingActionStore()}
      getSession={async () => session}
      navigate={async () => undefined}
    >
      <PreviewBody />
    </PendingAuthActionProvider>
  );
}
