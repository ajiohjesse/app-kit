import type { CompleteDocSlots } from "./complete-docs";
import { CommandPalettePreview } from "./command-palette-preview";

const registerExample = `"use client";

import {
  CommandPaletteHost,
  CommandPaletteProvider,
  CommandRegistration,
  useCommandRegistration,
} from "@/components/command-palette";
import { ShortcutRegistryProvider } from "@/components/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function RegisterInbox() {
  useCommandRegistration({
    id: "inbox",
    title: "Go to inbox",
    keywords: ["mail", "messages"],
    run: () => {
      window.location.assign("/inbox");
    },
  });
  return null;
}

export function App() {
  return (
    <ShortcutRegistryProvider>
      <ModalManagerProvider>
        <CommandPaletteProvider>
          <ModalManager />
          <CommandPaletteHost />
          <RegisterInbox />
          <CommandRegistration
            command={{
              id: "settings",
              title: "Open settings",
              run: () => {
                window.location.assign("/settings");
              },
            }}
          />
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}
`;

const globalHostExample = `"use client";

import {
  CommandPaletteHost,
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/command-palette";
import { ShortcutRegistryProvider } from "@/components/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function OpenButton() {
  const { open } = useCommandPalette();
  return (
    <button type="button" onClick={() => open()}>
      Open command palette
    </button>
  );
}

export function AppShell() {
  return (
    <ShortcutRegistryProvider>
      <ModalManagerProvider>
        <CommandPaletteProvider>
          <ModalManager />
          <CommandPaletteHost />
          <OpenButton />
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}
`;

const localEmbedExample = `"use client";

import {
  CommandPaletteEmbed,
  CommandPaletteProvider,
  CommandRegistration,
} from "@/components/command-palette";

export function LocalMenu() {
  return (
    <CommandPaletteProvider>
      <CommandRegistration
        command={{
          id: "local-rename",
          title: "Rename",
          scope: "editor",
          run: () => {},
        }}
      />
      <CommandPaletteEmbed scope="editor" />
    </CommandPaletteProvider>
  );
}
`;

const errorPathExample = `"use client";

import {
  CommandPaletteProvider,
  useCommandPalette,
  useCommandRegistration,
  type CommandConfirmAdapter,
} from "@/components/command-palette";

const confirm: CommandConfirmAdapter = {
  confirm: async () => "cancelled",
};

function DeleteCommand() {
  useCommandRegistration({
    id: "delete-project",
    title: "Delete project",
    destructive: true,
    run: async () => {
      await deleteProject();
    },
  });
  return null;
}

function Trigger() {
  const { execute } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => {
        void execute("delete-project").then((result) => {
          if (result.status === "error") {
            reportSafe(result.error.messageKey);
          }
        });
      }}
    >
      Run delete
    </button>
  );
}

export function DestructiveDemo() {
  return (
    <CommandPaletteProvider confirm={confirm}>
      <DeleteCommand />
      <Trigger />
    </CommandPaletteProvider>
  );
}

async function deleteProject() {}
function reportSafe(_key: string) {}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import {
  CommandPaletteHost,
  CommandPaletteProvider,
  CommandRegistration,
} from "@/components/command-palette";
import { ShortcutRegistryProvider } from "@/components/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function App() {
  return (
    <ShortcutRegistryProvider>
      <ModalManagerProvider>
        <CommandPaletteProvider>
          <ModalManager />
          <CommandPaletteHost />
          <CommandRegistration
            command={{
              id: "home",
              title: "Go home",
              run: () => {
                window.location.assign("/");
              },
            }}
          />
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
import {
  CommandPaletteHost,
  CommandPaletteProvider,
} from "@/components/command-palette";
import { ShortcutRegistryProvider } from "@/components/keyboard-shortcuts";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ShortcutRegistryProvider>
          <ModalManagerProvider>
            <CommandPaletteProvider>
              <ModalManager />
              <CommandPaletteHost />
              {children}
            </CommandPaletteProvider>
          </ModalManagerProvider>
        </ShortcutRegistryProvider>
      </body>
    </html>
  );
}
`;

export const commandPaletteDocs: CompleteDocSlots = {
  preview: <CommandPalettePreview />,
  examples: [
    { label: "register.tsx", language: "tsx", code: registerExample },
    { label: "global-host.tsx", language: "tsx", code: globalHostExample },
    { label: "local-embed.tsx", language: "tsx", code: localEmbedExample },
    { label: "error-path.tsx", language: "tsx", code: errorPathExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [{ label: "layout.tsx", language: "tsx", code: nextRecipe }],
  api: (
    <dl className="api-list">
      <dt className="mono">CommandPaletteProvider</dt>
      <dd>
        Client provider for the command registry. Optional <code>confirm</code>{" "}
        adapter (usually confirm-dialog), optional <code>navigate</code>{" "}
        adapter, and optional <code>classifiers</code> for{" "}
        <code>ErrorClassification</code>.
      </dd>
      <dt className="mono">CommandPaletteHost</dt>
      <dd>
        Default global host. Opens a modal-manager <code>dialog</code> entry
        whose contents are the shadcn Command primitive — not a second Dialog
        root. Place <code>ModalManager</code> inside{" "}
        <code>CommandPaletteProvider</code> so the dialog content can read the
        command registry. Registers <code>Mod+K</code> through{" "}
        <code>@app-kit/keyboard-shortcuts</code>.
      </dd>
      <dt className="mono">CommandPaletteEmbed</dt>
      <dd>
        Inline command surface for a named scope. Does not use the overlay
        registry. Set <code>includeGlobal</code> to also show global commands.
      </dd>
      <dt className="mono">useCommandPalette()</dt>
      <dd>
        <code>open</code>, <code>close</code>, <code>registerCommand</code>,{" "}
        <code>listCommands</code>, <code>execute</code>, and <code>isOpen</code>
        . Duplicate ids reject with <code>CommandRegistrationError</code> unless{" "}
        <code>replace: true</code>.
      </dd>
      <dt className="mono">useCommandRegistration / CommandRegistration</dt>
      <dd>
        Effect-based registration. Unregisters on unmount. Strict Mode remount
        does not throw a duplicate-id conflict.
      </dd>
      <dt className="mono">Destructive commands</dt>
      <dd>
        <code>destructive: true</code> requires an injected <code>confirm</code>
        . Without it, execution throws{" "}
        <code>CommandDestructiveConfirmRequiredError</code> and the command does
        not run. Cancelled or dismissed confirms also skip the action.
      </dd>
      <dt className="mono">ErrorClassification</dt>
      <dd>
        Owned by <code>@lib/error-classification</code>. Execution failures
        resolve as <code>{`{ status: "error"; error }`}</code> with safe
        metadata only — raw exception text is not rendered by default.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place providers but must not register or execute commands before hydration.",
    "Default host is a modal-manager dialog containing Command. Do not mount CommandDialog as a second dialog root.",
    "confirm-dialog and action-runner stay optional injections, not hard registry dependencies.",
    "Manual-copy fallback: copy infra/command-palette.tsx to src/components/command-palette.tsx. Install @app-kit/modal-manager, @app-kit/error-classification, @app-kit/keyboard-shortcuts, and the shadcn command primitive first.",
  ],
};
