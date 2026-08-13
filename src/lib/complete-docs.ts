import type { ReactNode } from "react";
import type { DocCodeLanguage } from "@/components/doc-primitives";
import { errorClassificationDocs } from "@/lib/error-classification-docs";

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
};

export function getCompleteDoc(slug: string): CompleteDocSlots | undefined {
  return completeDocs[slug];
}
