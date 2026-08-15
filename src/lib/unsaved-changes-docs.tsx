import type { CompleteDocSlots } from "./complete-docs";
import { UnsavedChangesPreview } from "./unsaved-changes-preview";

const dirtyFlagExample = `"use client";

import { useState } from "react";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function Editor() {
  const [title, setTitle] = useState("");
  // Controlled dirty stays authoritative — the guard never infers it.
  const isDirty = title.length > 0;
  const { attemptNavigation } = useUnsavedChanges({
    isDirty,
    navigate: async (intent) => {
      window.location.assign(intent.href);
    },
  });

  return (
    <form>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        type="button"
        onClick={() => void attemptNavigation({ href: "/inbox" })}
      >
        Leave
      </button>
    </form>
  );
}
`;

const confirmExample = `"use client";

import { useMemo } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

function GuardedForm() {
  const { confirm } = useConfirmDialog();
  const confirmAdapter = useMemo(() => ({ confirm }), [confirm]);
  const { markDirty, markClean, attemptNavigation } = useUnsavedChanges({
    confirm: confirmAdapter,
    confirmOptions: {
      title: "Leave without saving?",
      description: "Unsaved edits will be lost.",
      confirmLabel: "Leave",
      cancelLabel: "Stay",
      destructive: true,
    },
    navigate: async (intent) => {
      window.location.assign(intent.href);
    },
  });

  return (
    <form
      onChange={() => markDirty()}
      onSubmit={(event) => {
        event.preventDefault();
        markClean();
      }}
    >
      <textarea />
      <button
        type="button"
        onClick={() => void attemptNavigation({ href: "/inbox" })}
      >
        Leave
      </button>
      <button type="submit">Save</button>
    </form>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <GuardedForm />
    </ModalManagerProvider>
  );
}
`;

const retryExample = `"use client";

import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function SpaLeaveButton({
  confirm,
}: {
  confirm: (options: {
    title: string;
    description?: string;
  }) => Promise<"confirmed" | "cancelled" | "dismissed">;
}) {
  const { markDirty, attemptNavigation } = useUnsavedChanges({
    confirm: { confirm },
    navigate: async (intent, { bypassToken }) => {
      // One-shot bypass token is for adapters that re-enter attemptNavigation.
      // A failed retry returns "navigation-failed" and does not re-prompt.
      await routerPush(intent.href, { bypassToken });
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        markDirty();
        void attemptNavigation({ href: "/settings" });
      }}
    >
      Go to settings
    </button>
  );
}

async function routerPush(
  _href: string,
  _options: { bypassToken?: string }
) {}
`;

const nextLimitationExample = `"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function NextGuardedEditor({
  confirm,
}: {
  confirm: (options: { title: string }) => Promise<
    "confirmed" | "cancelled" | "dismissed"
  >;
}) {
  const router = useRouter();
  const { isDirty, markDirty, attemptNavigation } = useUnsavedChanges({
    confirm: { confirm },
    navigate: async (intent) => {
      router.push(intent.href);
    },
  });

  return (
    <div>
      <textarea onChange={() => markDirty()} />
      {/* Wrap in-app exits — App Router does not offer a universal lock. */}
      <Link
        href="/inbox"
        onClick={(event) => {
          if (!isDirty) return;
          event.preventDefault();
          void attemptNavigation({ href: "/inbox" });
        }}
      >
        Inbox
      </Link>
      <button
        type="button"
        onClick={() => void attemptNavigation({ href: "/inbox" })}
      >
        Programmatic leave
      </button>
      <p>
        beforeunload still warns on tab close. Unwrapped Link/router calls are
        best-effort only.
      </p>
    </div>
  );
}
`;

const spaRecipe = `"use client";

import { useNavigate } from "react-router";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function SpaEditor() {
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const { markDirty, attemptNavigation, cancelNavigation } = useUnsavedChanges({
    confirm: { confirm },
    navigate: async (intent) => {
      navigate(intent.href, { replace: intent.replace });
    },
    cancelNavigation: () => {
      // Adapter-owned: undo a blocked history traversal if you intercepted one.
    },
  });

  return (
    <form onChange={() => markDirty()}>
      <textarea />
      <button
        type="button"
        onClick={() => void attemptNavigation({ href: "/home" })}
      >
        Home
      </button>
      <button type="button" onClick={() => cancelNavigation()}>
        Cancel pending leave
      </button>
    </form>
  );
}
`;

const nextRecipe = `"use client";

import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function NextEditor() {
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const { markDirty, attemptNavigation } = useUnsavedChanges({
    confirm: { confirm },
    navigate: async (intent) => {
      router.push(intent.href);
    },
  });

  return (
    <form onChange={() => markDirty()}>
      <textarea />
      <button
        type="button"
        onClick={() => void attemptNavigation({ href: "/inbox" })}
      >
        Leave
      </button>
    </form>
  );
}
`;

export const unsavedChangesDocs: CompleteDocSlots = {
  preview: <UnsavedChangesPreview />,
  examples: [
    { label: "dirty-flag.tsx", language: "tsx", code: dirtyFlagExample },
    { label: "confirm-leave.tsx", language: "tsx", code: confirmExample },
    { label: "one-shot-retry.tsx", language: "tsx", code: retryExample },
    {
      label: "next-limitation.tsx",
      language: "tsx",
      code: nextLimitationExample,
    },
  ],
  spaRecipes: [{ label: "spa-router.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "next-app-router.tsx", language: "tsx", code: nextRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">createUnsavedChangesGuard(options)</dt>
      <dd>
        Framework-neutral controller. Dirty is consumer-owned via{" "}
        <code>getIsDirty</code> or <code>markDirty</code>/<code>markClean</code>
        . Registers <code>beforeunload</code> only while mounted and dirty.
      </dd>
      <dt className="mono">useUnsavedChanges(options)</dt>
      <dd>
        React hook: mounts the guard, exposes dirty helpers,{" "}
        <code>attemptNavigation</code>, <code>cancelNavigation</code>, and{" "}
        <code>retryNavigation</code>. Inject{" "}
        <code>confirm: {"{ confirm }"}</code> from{" "}
        <code>useConfirmDialog()</code>.
      </dd>
      <dt className="mono">policy</dt>
      <dd>
        <code>allow</code>, <code>block-and-confirm</code> (default), or{" "}
        <code>block-with-custom-flow</code>. Never silently blocks or discards.
      </dd>
      <dt className="mono">attemptNavigation(intent)</dt>
      <dd>
        Returns <code>allowed</code>, <code>cancelled</code>,{" "}
        <code>dismissed</code>, <code>navigated</code>,{" "}
        <code>navigation-failed</code>, <code>blocked</code>, or{" "}
        <code>ignored</code> (concurrent attempt while confirm is open).
        Confirmed leave retries once with a bypass token.
      </dd>
      <dt className="mono">UnsavedConfirmAdapter</dt>
      <dd>
        Injected confirm-dialog boundary. Only <code>confirmed</code> permits
        retry; cancel/dismiss/errors leave dirty unchanged. Missing confirm
        while dirty returns <code>blocked</code>.
      </dd>
    </dl>
  ),
  limitations: [
    "Next.js App Router in-app navigation blocking is best-effort: wrap links, forms, and programmatic router calls. There is no universal App Router lock.",
    "beforeunload shows the browser's generic warning; custom text is neither promised nor required.",
    "Hard reloads, address-bar navigation, crashes, and guaranteed async flush during unload are outside this item.",
    "Independent of draft-autosave — call flush()/markClean() explicitly when coordinating saves.",
    "Manual-copy fallback: copy unsaved-changes.ts to src/lib/unsaved-changes.ts and unsaved-changes-provider.tsx to src/components/unsaved-changes-provider.tsx.",
  ],
};
