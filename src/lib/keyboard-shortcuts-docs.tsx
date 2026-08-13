import type { CompleteDocSlots } from "./complete-docs";
import { KeyboardShortcutsPreview } from "./keyboard-shortcuts-preview";

const usage = `"use client";

import {
  ShortcutRegistryProvider,
  useShortcut,
} from "@/components/keyboard-shortcuts";

function OpenPalette() {
  useShortcut({
    id: "open-palette",
    shortcut: "Mod+K",
    handler: () => {
      console.log("open palette");
    },
  });

  return null;
}

export function App() {
  return (
    <ShortcutRegistryProvider>
      <OpenPalette />
    </ShortcutRegistryProvider>
  );
}
`;

const platformLabels = `"use client";

import { formatShortcut } from "@/components/keyboard-shortcuts";

export function ShortcutHint() {
  return <kbd>{formatShortcut("Mod+K")}</kbd>;
}
`;

const conflictExample = `"use client";

import {
  registerShortcut,
  ShortcutConflictError,
} from "@/components/keyboard-shortcuts";

export function registerOpen() {
  try {
    return registerShortcut({
      shortcut: "Mod+K",
      handler: () => {
        console.log("open");
      },
    });
  } catch (error) {
    if (error instanceof ShortcutConflictError) {
      console.warn(error.chord, error.scope);
    }
    throw error;
  }
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  ShortcutRegistryProvider,
  useShortcut,
  useShortcutScope,
} from "@/components/keyboard-shortcuts";

function Editor() {
  useShortcutScope("editor", { compose: true });
  useShortcut({
    shortcut: "Mod+S",
    scope: "editor",
    handler: () => {
      console.log("save");
    },
  });

  return <textarea />;
}

createRoot(document.getElementById("root")!).render(
  <ShortcutRegistryProvider>
    <Editor />
  </ShortcutRegistryProvider>
);
`;

const nextRecipe = `import type { ReactNode } from "react";
import { ShortcutRegistryProvider } from "@/components/keyboard-shortcuts";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ShortcutRegistryProvider>{children}</ShortcutRegistryProvider>
      </body>
    </html>
  );
}
`;

export const keyboardShortcutsDocs: CompleteDocSlots = {
  preview: <KeyboardShortcutsPreview />,
  examples: [
    { label: "register-shortcut.tsx", language: "tsx", code: usage },
    {
      label: "platform-label.tsx",
      language: "tsx",
      code: platformLabels,
    },
    {
      label: "conflict.ts",
      language: "typescript",
      code: conflictExample,
    },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">ShortcutRegistryProvider</dt>
      <dd>
        Client-only owner of the shortcut registry. Attach the window listener
        after hydration. Optional <code>platform</code> and <code>onError</code>
        . Nested providers stay isolated.
      </dd>
      <dt className="mono">useShortcut(registration)</dt>
      <dd>
        Effect-based registration. Unregisters on cleanup. Strict Mode remount
        does not emit a typed conflict. Default scope is <code>global</code>.
      </dd>
      <dt className="mono">registerShortcut(registration)</dt>
      <dd>
        Imperative register inside a provider. Returns an idempotent unregister.
        Callers must unregister themselves.
      </dd>
      <dt className="mono">useShortcutScope(name, options?)</dt>
      <dd>
        Activates a named shortcut scope. Isolated by default.{" "}
        <code>compose: true</code> lets an active child shadow a matching parent
        chord while unrelated parent registrations stay eligible.
      </dd>
      <dt className="mono">canonicalizeShortcut(input, platform?)</dt>
      <dd>
        Single-chord grammar only. Canonical tokens such as <code>Mod+K</code>,
        deterministic modifier order, and <code>Ctrl</code>/<code>Meta</code>{" "}
        aliases mapped to <code>Mod</code> where that is the platform modifier.
      </dd>
      <dt className="mono">formatShortcut(input, platform?)</dt>
      <dd>
        Platform label for a chord: <code>⌘K</code> on macOS,{" "}
        <code>Ctrl+K</code> on Windows.
      </dd>
      <dt className="mono">ShortcutRegistration</dt>
      <dd>
        <code>shortcut</code>, <code>handler</code>, optional <code>id</code>,{" "}
        <code>scope</code> (default <code>global</code>), <code>priority</code>{" "}
        (default 0), <code>exclusive</code> (default true),{" "}
        <code>allowInInputs</code> (default false), <code>repeat</code> (
        <code>&quot;ignore&quot;</code> | <code>&quot;allow&quot;</code>),{" "}
        <code>preventDefault</code> (default false).
      </dd>
      <dt className="mono">ShortcutConflictError</dt>
      <dd>
        Thrown when a new registration ties an existing one on chord, scope, and
        priority. Pass an explicit <code>id</code> to replace that logical
        registration.
      </dd>
      <dt className="mono">Dispatch defaults</dt>
      <dd>
        Higher priority, then more-specific active scope, then most recent.
        Exclusive by default. Suppressed in text inputs and contenteditable. Key
        repeats ignored unless <code>repeat: &quot;allow&quot;</code>. Browser
        defaults stay unless <code>preventDefault: true</code>.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place ShortcutRegistryProvider but cannot register or listen before hydration.",
    "Sequences are out of scope. Grammar is a single chord such as Mod+K.",
    "No events are queued before hydration or after provider teardown.",
    "Imperative registerShortcut() callers must unregister; the returned function is idempotent.",
    "Manual-copy fallback: copy the registry file to src/components/keyboard-shortcuts.tsx (target @components/keyboard-shortcuts.tsx).",
  ],
};
