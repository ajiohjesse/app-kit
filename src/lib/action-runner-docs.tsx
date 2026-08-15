import type { CompleteDocSlots } from "./complete-docs";
import { ActionRunnerPreview } from "./action-runner-preview";

const basicExample = `"use client";

import {
  ActionRunnerProvider,
  useActionRunner,
} from "@/components/action-runner";

function SaveButton() {
  const { run, state } = useActionRunner();

  return (
    <button
      type="button"
      disabled={state.status === "pending"}
      onClick={() => {
        void run(async ({ signal }) => {
          await saveDraft({ signal });
        });
      }}
    >
      {state.status === "pending" ? "Saving…" : "Save"}
    </button>
  );
}

export function App() {
  return (
    <ActionRunnerProvider>
      <SaveButton />
    </ActionRunnerProvider>
  );
}

async function saveDraft(_input: { signal: AbortSignal }) {}
`;

const overlayExample = `"use client";

import {
  ActionRunnerProvider,
  useActionRunner,
} from "@/components/action-runner";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
} from "@/components/loading-overlay";

function SaveButton() {
  const { run } = useActionRunner();

  return (
    <button
      type="button"
      onClick={() => {
        void run(
          async () => {
            await save();
          },
          { label: "Saving" }
        );
      }}
    >
      Save
    </button>
  );
}

function AppBody() {
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
      <LoadingOverlay />
      <SaveButton />
    </ActionRunnerProvider>
  );
}

export function App() {
  return (
    <LoadingOverlayProvider>
      <AppBody />
    </LoadingOverlayProvider>
  );
}

async function save() {}
`;

const confirmExample = `"use client";

import {
  ActionRunnerProvider,
  useActionRunner,
} from "@/components/action-runner";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function DeleteButton({ id }: { id: string }) {
  const { run } = useActionRunner();

  return (
    <button
      type="button"
      onClick={() => {
        void run(
          async () => {
            await deleteFile(id);
          },
          {
            confirm: {
              title: "Delete file?",
              description: "This cannot be undone.",
              confirmLabel: "Delete",
              destructive: true,
            },
          }
        ).catch(() => undefined);
      }}
    >
      Delete
    </button>
  );
}

function AppBody({ id }: { id: string }) {
  const { confirm } = useConfirmDialog();

  return (
    <ActionRunnerProvider confirm={{ confirm }}>
      <DeleteButton id={id} />
    </ActionRunnerProvider>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <AppBody id="file-1" />
    </ModalManagerProvider>
  );
}

async function deleteFile(_id: string) {}
`;

const serverActionExample = `"use client";

import { useActionRunner } from "@/components/action-runner";
import { publishPost } from "./actions";

export function PublishButton({ id }: { id: string }) {
  const { run, state } = useActionRunner();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void run(async () => {
            // Server Actions are opaque async adapters — no Next imports here.
            await publishPost(id);
          }).catch(() => undefined);
        }}
      >
        Publish
      </button>
      {state.error ? <p role="alert">{state.error.message}</p> : null}
    </div>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  ActionRunnerProvider,
  useActionRunner,
} from "@/components/action-runner";

function Toolbar() {
  const { run, state } = useActionRunner();
  return (
    <button
      type="button"
      onClick={() => {
        void run(async () => sync());
      }}
    >
      {state.status === "pending" ? "Syncing…" : "Sync"}
    </button>
  );
}

function App() {
  return (
    <ActionRunnerProvider>
      <Toolbar />
    </ActionRunnerProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

async function sync() {}
`;

const nextRecipe = `import type { ReactNode } from "react";
import { ActionRunnerProvider } from "@/components/action-runner";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ActionRunnerProvider>{children}</ActionRunnerProvider>
      </body>
    </html>
  );
}
`;

const nextActionsModule = `"use server";

export async function publishPost(id: string) {
  await dbPublish(id);
}

async function dbPublish(_id: string) {}
`;

export const actionRunnerDocs: CompleteDocSlots = {
  preview: <ActionRunnerPreview />,
  examples: [
    { label: "basic-run.tsx", language: "tsx", code: basicExample },
    { label: "overlay.tsx", language: "tsx", code: overlayExample },
    { label: "confirm.tsx", language: "tsx", code: confirmExample },
    {
      label: "server-action.tsx",
      language: "tsx",
      code: serverActionExample,
    },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "layout.tsx", language: "tsx", code: nextRecipe },
    { label: "actions.ts", language: "typescript", code: nextActionsModule },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">ActionRunnerProvider</dt>
      <dd>
        Client-only named scope for typed async lifecycles. Default concurrency
        is serial. Optional <code>loadingOverlay</code> and <code>confirm</code>{" "}
        adapters are injected — this item does not take a registry dependency on
        those hosts. Nested providers are independent scopes.
      </dd>
      <dt className="mono">useActionRunner()</dt>
      <dd>
        Returns <code>run</code>, <code>cancel</code>, <code>retry</code>,{" "}
        <code>state</code>, and <code>scope</code>. Pass{" "}
        <code>{`{ scope }`}</code> to assert the named provider; a mismatch
        throws. Compatible with confirm-dialog&apos;s optional{" "}
        <code>actionRunner.run</code> injection.
      </dd>
      <dt className="mono">run(action, options?)</dt>
      <dd>
        Runs an async function with a runtime context (<code>signal</code>,{" "}
        <code>scope</code>, <code>attemptId</code>, optional{" "}
        <code>metadata</code>). Lifecycle: optional confirm → overlay{" "}
        <code>begin</code> → invoke → <code>succeed</code> / <code>fail</code> /{" "}
        <code>release</code> on cancel → exactly-once cleanup. Errors are
        rethrown after lifecycle handling. Optional <code>timeoutMs</code>,{" "}
        <code>concurrency</code>, and <code>onDuplicate</code> (
        <code>allow</code> | <code>ignore</code> | <code>replace</code>).
      </dd>
      <dt className="mono">state</dt>
      <dd>
        Per-scope status: <code>idle</code> | <code>pending</code> |{" "}
        <code>succeeded</code> | <code>failed</code> | <code>cancelled</code>.
        Failed render metadata is <code>ErrorClassification</code> from{" "}
        <code>@lib/error-classification</code>. Raw exception text is never in
        render state — pass raw errors to <code>onLogError</code>.
      </dd>
      <dt className="mono">Overlay token lifecycle</dt>
      <dd>
        When a loading-overlay adapter is injected: <code>begin</code> before
        invoke; <code>succeed</code> on success; <code>fail</code> on failure;{" "}
        <code>release</code> only on cancel before a terminal presentation.{" "}
        <code>finally</code> does not call those again. Adapter failures do not
        hide the action outcome.
      </dd>
      <dt className="mono">Confirm</dt>
      <dd>
        Optional via injected confirm-dialog. Dismissal or cancel prevents
        invocation and marks the attempt <code>cancelled</code>.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place ActionRunnerProvider but must not call run().",
    "No motion or toast library. Wire onSuccess / onError / onCancelled / onLogError to your notifier.",
    "loading-overlay and confirm-dialog are optional injected adapters, not registry dependencies.",
    "Server Actions are supported only as opaque async functions. No direct Next.js import; closures are not assumed serializable.",
    "Manual-copy fallback: copy infra/action-runner.tsx to src/components/action-runner.tsx. Install @app-kit/error-classification first.",
  ],
};
