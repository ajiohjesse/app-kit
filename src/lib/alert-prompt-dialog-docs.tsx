import type { CompleteDocSlots } from "./complete-docs";
import { AlertPromptDialogPreview } from "./alert-prompt-dialog-preview";

const alertExample = `"use client";

import { useAlertPromptDialog } from "@/components/alert-prompt-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function SavedNotice() {
  const { alert } = useAlertPromptDialog();

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await alert({
          title: "Saved",
          description: "Your draft is stored in this tab.",
          variant: "neutral",
        });
        if (result !== "acknowledged") return;
      }}
    >
      Save
    </button>
  );
}

export function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <SavedNotice />
    </ModalManagerProvider>
  );
}
`;

const promptExample = `"use client";

import { useAlertPromptDialog } from "@/components/alert-prompt-dialog";

export function RenameButton() {
  const { prompt } = useAlertPromptDialog();

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await prompt({
          title: "Rename file",
          label: "File name",
          defaultValue: "notes.md",
        });
        if (result.status !== "submitted") return;
        await rename(result.value);
      }}
    >
      Rename
    </button>
  );
}

async function rename(_name: string) {}
`;

const validateExample = `"use client";

import { useAlertPromptDialog } from "@/components/alert-prompt-dialog";

export function AgePrompt() {
  const { prompt } = useAlertPromptDialog();

  return (
    <button
      type="button"
      onClick={() => {
        void prompt({
          title: "Age",
          label: "Years",
          trim: true,
          validate: (value) => {
            if (!value) {
              return { error: "Age is required." };
            }
          },
          parse: (value) => {
            const years = Number(value);
            if (!Number.isInteger(years) || years < 1) {
              throw new Error("not an age");
            }
            return years;
          },
        });
      }}
    >
      Ask age
    </button>
  );
}
`;

const spaRecipe = `"use client";

import { createRoot } from "react-dom/client";
import { useAlertPromptDialog } from "@/components/alert-prompt-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "@/components/modal-manager-provider";

function Toolbar() {
  const { alert, prompt } = useAlertPromptDialog();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void alert({ title: "Ready" });
        }}
      >
        Alert
      </button>
      <button
        type="button"
        onClick={() => {
          void prompt({ title: "Name", label: "Name" });
        }}
      >
        Prompt
      </button>
    </>
  );
}

function App() {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <Toolbar />
    </ModalManagerProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
`;

const nextRecipe = `import type { ReactNode } from "react";
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
        <ModalManagerProvider>
          <ModalManager />
          {children}
        </ModalManagerProvider>
      </body>
    </html>
  );
}
`;

const nextClientRecipe = `"use client";

import { useAlertPromptDialog } from "@/components/alert-prompt-dialog";

export function AskNameButton() {
  const { prompt } = useAlertPromptDialog();

  return (
    <button
      type="button"
      onClick={() => {
        void prompt({ title: "Display name", label: "Name" });
      }}
    >
      Ask name
    </button>
  );
}
`;

export const alertPromptDialogDocs: CompleteDocSlots = {
  preview: <AlertPromptDialogPreview />,
  examples: [
    { label: "alert.tsx", language: "tsx", code: alertExample },
    { label: "prompt.tsx", language: "tsx", code: promptExample },
    { label: "validate.tsx", language: "tsx", code: validateExample },
  ],
  spaRecipes: [{ label: "spa.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "layout.tsx", language: "tsx", code: nextRecipe },
    { label: "ask-name.tsx", language: "tsx", code: nextClientRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">useAlertPromptDialog()</dt>
      <dd>
        Client hook over modal-manager. Requires{" "}
        <code>ModalManagerProvider</code> and a <code>ModalManager</code> host.
        This item does not mount a second overlay layer.
      </dd>
      <dt className="mono">alert(options)</dt>
      <dd>
        Opens an <code>alert-dialog</code> entry and returns{" "}
        <code>acknowledged</code> or <code>dismissed</code>. Escape and backdrop
        dismissal default off. <code>variant</code> is <code>neutral</code> |{" "}
        <code>warning</code> | <code>error</code> and changes semantics and
        styling only. Destructive confirmation belongs to confirm-dialog. Title
        is required; description and <code>acknowledgeLabel</code> are optional.
        Acknowledgement is focused on open.
      </dd>
      <dt className="mono">prompt(options)</dt>
      <dd>
        Opens a <code>dialog</code> entry with exactly one text input. Resolves{" "}
        <code>{`{ status: "submitted"; value }`}</code> or{" "}
        <code>{`{ status: "dismissed" }`}</code>. A submitted empty string is
        not a dismissal. Escape dismissal defaults on; backdrop dismissal
        defaults off. The input is focused on open unless{" "}
        <code>initialFocus</code> is <code>submit</code>.
      </dd>
      <dt className="mono">validate / parse</dt>
      <dd>
        Optional sync or async. Validation runs first. Parser failures stay in
        the dialog as a safe validation error; raw exception text is never
        rendered. Trimming is opt-in via <code>trim</code>. While pending,
        submit is disabled, duplicate submits are ignored, and dismissal stays
        available unless <code>dismissible</code> is false.
      </dd>
    </dl>
  ),
  limitations: [
    "Client-only. Server Components may place ModalManagerProvider but must not call alert() or prompt().",
    "Alert opens a modal-manager alert-dialog entry. Prompt opens a dialog entry. Do not mount a second overlay layer.",
    "Single-input only. Multi-field prompts are unsupported — compose a custom modal-manager entry.",
    "No schema-driven forms, automatic toasts, or server-side prompt state.",
    "Manual-copy fallback: copy infra/alert-prompt-dialog.tsx to src/components/alert-prompt-dialog.tsx. Install @app-kit/modal-manager and the shadcn input first.",
  ],
};
