import type { CompleteDocSlots } from "./complete-docs";
import { DraftAutosavePreview } from "./draft-autosave-preview";

const saveFlushExample = `"use client";

import { useState } from "react";
import { useDraftAutosave } from "@/components/draft-autosave-provider";

export function DraftForm() {
  const { state, update, flush, restore, discard } = useDraftAutosave({
    draftId: "invoice-form",
    schemaVersion: "v1",
  });
  const [title, setTitle] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void flush().then(async (result) => {
          if (result.status !== "saved" && result.status !== "unchanged") return;
          await submitInvoice({ title });
          await discard();
        });
      }}
    >
      <input
        value={title}
        onChange={(event) => {
          const next = event.target.value;
          setTitle(next);
          update({ title: next });
        }}
      />
      <button type="button" onClick={() => void restore()}>
        Restore
      </button>
      <button type="button" onClick={() => void discard()}>
        Discard
      </button>
      <button type="submit">Submit</button>
      <p>{state.lifecycle}</p>
    </form>
  );
}

async function submitInvoice(_input: { title: string }) {}
`;

const namespaceExample = `"use client";

import { useSession } from "@/components/authentication-core-provider";
import { useDraftAutosave } from "@/components/draft-autosave-provider";

export function NamespacedDraft() {
  const session = useSession();
  const userId =
    session.status === "authenticated" ? session.user.id : null;

  const { state, update, adoptFromNamespace } = useDraftAutosave({
    draftId: "profile-form",
    schemaVersion: "v1",
    userId,
  });

  return (
    <div>
      <p>namespace: {state.namespace}</p>
      <button
        type="button"
        onClick={() => {
          // Auth transitions never merge silently — adopt explicitly.
          void adoptFromNamespace("anonymous");
        }}
      >
        Adopt anonymous draft
      </button>
      <textarea
        onChange={(event) => update({ bio: event.target.value })}
      />
    </div>
  );
}
`;

const conflictExample = `"use client";

import {
  createDraftAutosave,
  createLocalStorageDraftStore,
} from "@/lib/draft-autosave";

const store = createLocalStorageDraftStore();

export async function saveOrResolveConflict(payload: { title: string }) {
  const draft = createDraftAutosave({
    draftId: "shared-form",
    schemaVersion: "v1",
    store,
    getNamespace: () => "user-1",
  });

  await draft.restore();
  const result = await draft.save(payload);

  if (result.status === "conflict") {
    // Shared stores never last-write-wins. Choose explicitly.
    await draft.restore({ onConflict: "useStored" });
    return result.stored;
  }

  return result;
}
`;

const feedbackExample = `"use client";

import { useActionRunner } from "@/components/action-runner";
import { useDraftAutosave } from "@/components/draft-autosave-provider";

export function DraftWithFeedback() {
  const { run } = useActionRunner();
  const { update, flush } = useDraftAutosave({
    draftId: "notes",
    schemaVersion: "v1",
    onSaveFeedback: ({ phase }) => {
      // Feedback only — drafts are not pending-auth-action intents.
      void phase;
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        update({ body: "hello" });
        void run(async () => {
          await flush();
        });
      }}
    >
      Save draft
    </button>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import { useDraftAutosave } from "@/components/draft-autosave-provider";

function App() {
  const { update, flush, state } = useDraftAutosave({
    draftId: "spa-form",
    schemaVersion: "v1",
  });

  return (
    <main>
      <input onChange={(e) => update({ value: e.target.value })} />
      <button type="button" onClick={() => void flush()}>
        Flush
      </button>
      <p>{state.lifecycle}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `"use client";

import { useSession } from "@/components/authentication-core-provider";
import { useDraftAutosave } from "@/components/draft-autosave-provider";

export function InvoiceDraftFields() {
  const session = useSession();
  const userId =
    session.status === "authenticated" ? session.user.id : null;
  const { update, state } = useDraftAutosave({
    draftId: "invoice-form",
    schemaVersion: "v1",
    userId,
  });

  return (
    <label>
      Title
      <input
        onChange={(event) => update({ title: event.target.value })}
      />
      <span>{state.lifecycle}</span>
    </label>
  );
}
`;

export const draftAutosaveDocs: CompleteDocSlots = {
  preview: <DraftAutosavePreview />,
  examples: [
    { label: "save-flush.tsx", language: "tsx", code: saveFlushExample },
    { label: "namespace.tsx", language: "tsx", code: namespaceExample },
    { label: "conflict.tsx", language: "tsx", code: conflictExample },
    { label: "feedback.tsx", language: "tsx", code: feedbackExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "next.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">DraftIdentity</dt>
      <dd>
        Explicit <code>draftId</code> + <code>schemaVersion</code>. Identity is
        never inferred from route, form name, or component instance.
      </dd>
      <dt className="mono">resolveDraftNamespace(userId?)</dt>
      <dd>
        Authenticated namespace is <code>AuthUser.id</code>; otherwise{" "}
        <code>anonymous</code>. Auth transitions never silently merge.
      </dd>
      <dt className="mono">DraftStore</dt>
      <dd>
        Injected persistence: <code>get</code>, <code>set</code> with{" "}
        <code>baseRevision</code>, and <code>remove</code>. A write whose base
        revision is behind the stored revision returns <code>conflict</code>,
        not last-write-wins.
      </dd>
      <dt className="mono">createSessionStorageDraftStore()</dt>
      <dd>
        Documented default browser store — tab-local <code>sessionStorage</code>
        . Use <code>createLocalStorageDraftStore()</code> or a custom store for
        shared/durable persistence.
      </dd>
      <dt className="mono">createDraftAutosave(options)</dt>
      <dd>
        Controller with <code>update</code> (debounced), <code>save</code>,{" "}
        <code>flush</code>, <code>restore</code>, <code>discard</code>,{" "}
        <code>syncNamespace</code>, and explicit <code>adoptFromNamespace</code>
        . Injectable clock for deterministic debounce tests. Optional{" "}
        <code>onSaveFeedback</code> for action-runner style feedback only.
      </dd>
      <dt className="mono">useDraftAutosave(options)</dt>
      <dd>
        React hook over the controller. Pass <code>userId</code> from{" "}
        <code>useSession().user.id</code> when authenticated. Defaults to
        sessionStorage and restores on mount unless{" "}
        <code>restoreOnMount: false</code>.
      </dd>
    </dl>
  ),
  limitations: [
    "Default store is sessionStorage (tab-local). Two tabs do not share default records.",
    "Shared stores (localStorage, IndexedDB, server) must honor revision conflicts; never last-write-wins.",
    "Auth transitions clear in-memory state for the new namespace. Call adoptFromNamespace explicitly to bring anonymous data across.",
    "Drafts are not pending-auth-action intents and are never replayed as mutations. Optional action-runner wiring is feedback only.",
    "beforeunload persistence is best-effort; call flush() before navigation or submit.",
    "Manual-copy fallback: copy draft-autosave.ts to src/lib/draft-autosave.ts and draft-autosave-provider.tsx to src/components/draft-autosave-provider.tsx.",
  ],
};
