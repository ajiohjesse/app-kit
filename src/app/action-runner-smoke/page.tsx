"use client";

import { useState } from "react";
import {
  ActionRunnerProvider,
  useActionRunner,
} from "../../../infra/action-runner";
import { useConfirmDialog } from "../../../infra/confirm-dialog";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
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

function OverlayWiredBody() {
  const { run, state } = useActionRunner();
  const [gate] = useState(() => deferred());

  return (
    <div>
      <h2>overlay</h2>
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
            { label: "Working" }
          );
        }}
      >
        Start pending
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
          void run(async () => {
            throw new Error("secret failure detail");
          }).catch(() => undefined);
        }}
      >
        Start failing
      </button>
      <LoadingOverlay />
    </div>
  );
}

function OverlayWired() {
  const overlay = useLoadingOverlay();
  return (
    <ActionRunnerProvider
      loadingOverlay={{
        begin: overlay.begin,
        update: overlay.update,
        succeed: overlay.succeed,
        fail: overlay.fail,
        release: overlay.release,
      }}
    >
      <OverlayWiredBody />
    </ActionRunnerProvider>
  );
}

function ConfirmWiredBody() {
  const { run, state } = useActionRunner();
  return (
    <div>
      <h2>confirm</h2>
      <p data-testid="confirm-runner-status">{state.status}</p>
      <button
        type="button"
        onClick={() => {
          void run(async () => "deleted", {
            confirm: {
              title: "Delete item?",
              description: "This cannot be undone.",
              confirmLabel: "Delete",
              destructive: true,
            },
          }).catch(() => undefined);
        }}
      >
        Delete with confirm
      </button>
    </div>
  );
}

function ConfirmWired() {
  const { confirm } = useConfirmDialog();
  return (
    <ActionRunnerProvider confirm={{ confirm }}>
      <ConfirmWiredBody />
    </ActionRunnerProvider>
  );
}

export default function ActionRunnerSmokePage() {
  return (
    <main>
      <h1>action-runner smoke</h1>
      <LoadingOverlayProvider
        scope="smoke"
        blocking={false}
        successDurationMs={2000}
        errorDurationMs={2000}
      >
        <OverlayWired />
      </LoadingOverlayProvider>
      <ModalManagerProvider>
        <ModalManager />
        <ConfirmWired />
      </ModalManagerProvider>
    </main>
  );
}
