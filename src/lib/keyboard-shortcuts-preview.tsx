"use client";

import { useState } from "react";
import {
  formatShortcut,
  ShortcutRegistryProvider,
  useShortcut,
} from "../../infra/keyboard-shortcuts";

const DEMO_SHORTCUT = "Alt+Shift+K";

function PreviewBody() {
  const [lastChord, setLastChord] = useState<string | null>(null);
  const label = formatShortcut(DEMO_SHORTCUT);

  useShortcut({
    shortcut: DEMO_SHORTCUT,
    handler: (event) => {
      setLastChord(event.chord);
    },
  });

  return (
    <div className="usage-sketch">
      <p>
        Registered <span className="mono">{DEMO_SHORTCUT}</span>
        {" → "}
        <span className="mono">{label}</span>
      </p>
      <p>
        {lastChord
          ? `Last fired: ${lastChord}`
          : `Press ${label} to fire the registered shortcut.`}
      </p>
    </div>
  );
}

export function KeyboardShortcutsPreview() {
  return (
    <ShortcutRegistryProvider>
      <PreviewBody />
    </ShortcutRegistryProvider>
  );
}
