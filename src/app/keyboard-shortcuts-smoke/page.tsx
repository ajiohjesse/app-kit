"use client";

import { useState } from "react";
import {
  ShortcutRegistryProvider,
  useShortcut,
} from "../../../infra/keyboard-shortcuts";

function SmokeBody() {
  const [blockedFires, setBlockedFires] = useState(0);
  const [allowedFires, setAllowedFires] = useState(0);

  useShortcut({
    shortcut: "Alt+Shift+K",
    handler: () => {
      setBlockedFires((count) => count + 1);
    },
  });

  useShortcut({
    shortcut: "Alt+Shift+P",
    allowInInputs: true,
    handler: () => {
      setAllowedFires((count) => count + 1);
    },
  });

  return (
    <main>
      <h1>keyboard-shortcuts smoke</h1>
      <p>blocked: {blockedFires}</p>
      <p>allowed: {allowedFires}</p>
      <input aria-label="note" />
    </main>
  );
}

export default function KeyboardShortcutsSmokePage() {
  return (
    <ShortcutRegistryProvider>
      <SmokeBody />
    </ShortcutRegistryProvider>
  );
}
