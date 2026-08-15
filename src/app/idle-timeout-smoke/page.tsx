"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "../../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";
import {
  IdleTimeoutProvider,
  useIdleTimeout,
} from "../../../infra/idle-timeout-provider";

function SmokeBody() {
  const { snapshot, extend } = useIdleTimeout();

  return (
    <main>
      <h1>idle-timeout smoke</h1>
      <p>
        state:{snapshot.state} reason:{snapshot.reason ?? "none"}
      </p>
      <button type="button" onClick={() => extend()}>
        Extend idle
      </button>
      <button type="button" data-testid="background">
        Background target
      </button>
    </main>
  );
}

function SmokeShell() {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <IdleTimeoutProvider
      idleMs={500}
      warningMs={30_000}
      confirm={confirmAdapter}
      auth={{
        signOut: async () => undefined,
      }}
      crossTabSignOut={false}
      channel={null}
    >
      <SmokeBody />
    </IdleTimeoutProvider>
  );
}

export default function IdleTimeoutSmokePage() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <SmokeShell />
    </ModalManagerProvider>
  );
}
