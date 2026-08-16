"use client";

import { useState } from "react";
import {
  ActionRunnerProvider,
  useActionRunner,
} from "../../../infra/action-runner";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "../../../infra/confirm-dialog";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
} from "../../../infra/loading-overlay";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";

function deferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function CompositionBody() {
  const { run, state } = useActionRunner();
  const [gate] = useState(() => deferred());

  return (
    <div>
      <h2>confirm + blocking</h2>
      <p data-testid="runner-status">{state.status}</p>
      {state.error ? (
        <p role="alert" data-testid="runner-error">
          {state.error.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          void run(
            async () => {
              await gate.promise;
              return "ok";
            },
            {
              confirm: {
                title: "Start work?",
                confirmLabel: "Start",
              },
              blocking: { label: "Working" },
            }
          ).catch(() => undefined);
        }}
      >
        Confirm then block
      </button>
      <button
        type="button"
        onClick={() => {
          gate.resolve();
        }}
      >
        Resolve pending
      </button>
      <button
        type="button"
        onClick={() => {
          void run(
            async () => {
              throw new Error("secret failure detail");
            },
            {
              confirm: { title: "Fail after confirm?" },
              blocking: true,
            }
          ).catch(() => undefined);
        }}
      >
        Confirm then fail
      </button>
      <LoadingOverlay />
    </div>
  );
}

function ConfirmOnlyBody() {
  const { confirm } = useConfirmDialog();
  const [last, setLast] = useState("idle");
  return (
    <div>
      <h2>confirm only</h2>
      <p data-testid="confirm-only-status">{last}</p>
      <button
        type="button"
        onClick={() => {
          void confirm({ title: "Leave?" }).then((value) => setLast(value));
        }}
      >
        Ask confirm
      </button>
    </div>
  );
}

export default function ActionRunnerSmokePage() {
  return (
    <main>
      <h1>action-runner smoke</h1>
      <ModalManagerProvider>
        <ModalManager />
        <ConfirmDialogProvider>
          <LoadingOverlayProvider
            scope="smoke"
            blocking={false}
            successDurationMs={2000}
            errorDurationMs={2000}
          >
            <ActionRunnerProvider>
              <CompositionBody />
              <ConfirmOnlyBody />
            </ActionRunnerProvider>
          </LoadingOverlayProvider>
        </ConfirmDialogProvider>
      </ModalManagerProvider>
    </main>
  );
}
