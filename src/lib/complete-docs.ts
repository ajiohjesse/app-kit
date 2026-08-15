import type { ReactNode } from "react";
import type { DocCodeLanguage } from "@/components/doc-primitives";
import { errorClassificationDocs } from "@/lib/error-classification-docs";
import { authenticationCoreDocs } from "@/lib/authentication-core-docs";
import { alertPromptDialogDocs } from "@/lib/alert-prompt-dialog-docs";
import { confirmDialogDocs } from "@/lib/confirm-dialog-docs";
import { featureFlagsDocs } from "@/lib/feature-flags-docs";
import { keyboardShortcutsDocs } from "@/lib/keyboard-shortcuts-docs";
import { modalManagerDocs } from "@/lib/modal-manager-docs";
import { offlineBannerDocs } from "@/lib/offline-banner-docs";
import { actionRunnerDocs } from "@/lib/action-runner-docs";
import { loadingOverlayDocs } from "@/lib/loading-overlay-docs";

export type DocExample = {
  label: string;
  code: string;
  language: DocCodeLanguage;
};

export type CompleteDocSlots = {
  preview: ReactNode;
  examples: DocExample[];
  api: ReactNode;
  spaRecipes?: DocExample[];
  nextRecipes?: DocExample[];
  limitations?: string[];
};

export const completeDocs: Partial<Record<string, CompleteDocSlots>> = {
  "action-runner": actionRunnerDocs,
  "alert-prompt-dialog": alertPromptDialogDocs,
  "authentication-core": authenticationCoreDocs,
  "confirm-dialog": confirmDialogDocs,
  "error-classification": errorClassificationDocs,
  "feature-flags": featureFlagsDocs,
  "keyboard-shortcuts": keyboardShortcutsDocs,
  "loading-overlay": loadingOverlayDocs,
  "modal-manager": modalManagerDocs,
  "offline-banner": offlineBannerDocs,
};

export function getCompleteDoc(slug: string): CompleteDocSlots | undefined {
  return completeDocs[slug];
}
