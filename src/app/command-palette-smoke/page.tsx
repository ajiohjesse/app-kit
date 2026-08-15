"use client";

import {
  CommandPaletteHost,
  CommandPaletteProvider,
  CommandRegistration,
  useCommandPalette,
} from "../../../infra/command-palette";
import { ShortcutRegistryProvider } from "../../../infra/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../../infra/modal-manager-provider";

function SmokeBody() {
  const { open } = useCommandPalette();

  return (
    <main>
      <h1>command-palette smoke</h1>
      <button type="button" onClick={() => open()}>
        Open palette
      </button>
      <CommandRegistration
        command={{
          id: "smoke-inbox",
          title: "Go to inbox",
          run: () => {},
        }}
      />
      <CommandRegistration
        command={{
          id: "smoke-settings",
          title: "Open settings",
          run: () => {},
        }}
      />
    </main>
  );
}

export default function CommandPaletteSmokePage() {
  return (
    <ShortcutRegistryProvider platform="windows">
      <ModalManagerProvider>
        <CommandPaletteProvider>
          <ModalManager />
          <CommandPaletteHost />
          <SmokeBody />
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}
