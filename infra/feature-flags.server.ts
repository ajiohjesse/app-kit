import "server-only";

import {
  createFlagSnapshot,
  identityKeyFromContext,
  type FlagEvaluationContext,
  type FlagSchema,
  type FlagSnapshot,
} from "@/infra/feature-flags";

export type ServerFlagReadInput = {
  context?: FlagEvaluationContext;
  request?: unknown;
};

export type ServerFlagAdapter = {
  snapshot: (input?: {
    context?: FlagEvaluationContext;
    request?: unknown;
    includeServerOnly?: boolean;
    evaluatedAt?: string;
  }) => Promise<FlagSnapshot>;
};

export function createServerFlagAdapter(config: {
  schema: FlagSchema;
  schemaVersion: string;
  read: (
    input: ServerFlagReadInput
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}): ServerFlagAdapter {
  return {
    async snapshot(input = {}) {
      const values = await config.read({
        context: input.context,
        request: input.request,
      });
      const { snapshot } = createFlagSnapshot(config.schema, {
        schemaVersion: config.schemaVersion,
        values,
        evaluatedAt: input.evaluatedAt,
        identityKey: identityKeyFromContext(input.context),
        includeServerOnly: input.includeServerOnly,
      });
      return snapshot;
    },
  };
}
