"use client";

import { useState } from "react";
import {
  CommandPaletteHost,
  CommandPaletteProvider,
  CommandRegistration,
  useCommandPalette,
} from "../../infra/command-palette";
import { ShortcutRegistryProvider } from "../../infra/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";

function PreviewBody() {
  const { open } = useCommandPalette();
  const [last, setLast] = useState("idle");

  return (
    <div className="usage-sketch">
      <p>
        Last run: <span className="mono">{last}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open()}>
          Open palette
        </button>
      </div>
      <CommandRegistration
        command={{
          id: "preview-inbox",
          title: "Go to inbox",
          keywords: ["mail"],
          run: () => setLast("inbox"),
        }}
      />
      <CommandRegistration
        command={{
          id: "preview-settings",
          title: "Open settings",
          run: () => setLast("settings"),
        }}
      />
    </div>
  );
}

export function CommandPalettePreview() {
  return (
    <ShortcutRegistryProvider platform="windows">
      <ModalManagerProvider>
        <CommandPaletteProvider>
          <ModalManager />
          <CommandPaletteHost />
          <PreviewBody />
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}
