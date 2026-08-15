"use client";

import { useMemo, useState } from "react";
import { useConfirmDialog } from "../../infra/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";
import {
  IdleTimeoutProvider,
  useIdleTimeout,
} from "../../infra/idle-timeout-provider";
import { FakeClock } from "@/test-utils/fake-clock";

function PreviewBody({ clock }: { clock: FakeClock }) {
  const { snapshot, extend, signOut } = useIdleTimeout();
  const [log, setLog] = useState("ready");

  return (
    <div className="usage-sketch">
      <p>
        Idle warnings use confirm-dialog. Continue extends the idle timer only.
      </p>
      <p>
        state:{snapshot.state} reason:{snapshot.reason ?? "none"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            clock.advanceBy(1_000);
            setLog(`advanced:state=${snapshot.state}`);
          }}
        >
          Advance 1s
        </button>
        <button
          type="button"
          onClick={() => {
            extend();
            setLog("extended");
          }}
        >
          Extend
        </button>
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => setLog("signed-out"));
          }}
        >
          Sign out
        </button>
      </div>
      <p>{log}</p>
    </div>
  );
}

function PreviewShell({ clock }: { clock: FakeClock }) {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);

  return (
    <IdleTimeoutProvider
      idleMs={1_000}
      warningMs={5_000}
      clock={clock}
      confirm={confirmAdapter}
      auth={{
        signOut: async () => undefined,
      }}
      crossTabSignOut={false}
      channel={null}
    >
      <PreviewBody clock={clock} />
    </IdleTimeoutProvider>
  );
}

export function IdleTimeoutPreview() {
  const [clock] = useState(() => new FakeClock());

  return (
    <ModalManagerProvider>
      <ModalManager />
      <PreviewShell clock={clock} />
    </ModalManagerProvider>
  );
}
