import type { ReactNode } from "react";
import type { DocCodeLanguage } from "@/components/doc-primitives";
import { errorClassificationDocs } from "@/lib/error-classification-docs";
import { featureFlagsDocs } from "@/lib/feature-flags-docs";
import { keyboardShortcutsDocs } from "@/lib/keyboard-shortcuts-docs";
import { modalManagerDocs } from "@/lib/modal-manager-docs";
import { offlineBannerDocs } from "@/lib/offline-banner-docs";

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
  "error-classification": errorClassificationDocs,
  "feature-flags": featureFlagsDocs,
  "keyboard-shortcuts": keyboardShortcutsDocs,
  "modal-manager": modalManagerDocs,
  "offline-banner": offlineBannerDocs,
};

export function getCompleteDoc(slug: string): CompleteDocSlots | undefined {
  return completeDocs[slug];
}
