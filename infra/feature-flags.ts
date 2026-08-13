export type FlagExposure = "public" | "server-only";

export type BooleanFlagDefinition = {
  type: "boolean";
  default: boolean;
  exposure: FlagExposure;
};

export type VariantFlagDefinition<T extends string = string> = {
  type: "variant";
  variants: readonly T[];
  default: T;
  exposure: FlagExposure;
};

export type FlagDefinition = BooleanFlagDefinition | VariantFlagDefinition;

export type FlagSchema = Record<string, FlagDefinition>;

export type FlagEvaluationContext = {
  userId?: string;
  attributes?: Record<string, string | number | boolean>;
};

export type FlagSnapshot = {
  schemaVersion: string;
  values: Record<string, boolean | string>;
  evaluatedAt?: string;
  identityKey?: string;
};

export type FlagFallbackReason =
  | "missing"
  | "invalid-type"
  | "disallowed-variant"
  | "malformed-snapshot"
  | "incompatible-snapshot"
  | "identity-changed";

export type FlagDiagnostic = {
  key: string;
  expected:
    { type: "boolean" } | { type: "variant"; variants: readonly string[] };
  reason: FlagFallbackReason;
  snapshotVersion?: string;
};

export type FlagAdapter = {
  evaluate: (input: {
    context?: FlagEvaluationContext;
    signal?: AbortSignal;
  }) => Promise<Record<string, unknown>> | Record<string, unknown>;
};

export type FlagRefreshResult =
  | { status: "updated"; snapshot: FlagSnapshot }
  | {
      status: "failed";
      reason: "invalid-snapshot" | "adapter-error" | "aborted";
    };

export type CreateFlagSnapshotInput = {
  schemaVersion: string;
  values: Record<string, unknown>;
  evaluatedAt?: string;
  identityKey?: string;
  includeServerOnly?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedOf(definition: FlagDefinition): FlagDiagnostic["expected"] {
  if (definition.type === "boolean") {
    return { type: "boolean" };
  }
  return { type: "variant", variants: definition.variants };
}

function evaluateDefinition(
  definition: FlagDefinition,
  raw: unknown
): { value: boolean | string; reason?: FlagFallbackReason } {
  if (raw === undefined) {
    return { value: definition.default, reason: "missing" };
  }
  if (definition.type === "boolean") {
    if (typeof raw !== "boolean") {
      return { value: definition.default, reason: "invalid-type" };
    }
    return { value: raw };
  }
  if (typeof raw !== "string") {
    return { value: definition.default, reason: "invalid-type" };
  }
  if (!definition.variants.includes(raw)) {
    return { value: definition.default, reason: "disallowed-variant" };
  }
  return { value: raw };
}

export function identityKeyFromContext(
  context?: FlagEvaluationContext
): string | undefined {
  if (!context) {
    return undefined;
  }
  if (context.userId === undefined && context.attributes === undefined) {
    return undefined;
  }
  return JSON.stringify({
    userId: context.userId ?? null,
    attributes: context.attributes ?? {},
  });
}

export function createFlagSnapshot(
  schema: FlagSchema,
  input: CreateFlagSnapshotInput
): { snapshot: FlagSnapshot; diagnostics: FlagDiagnostic[] } {
  const diagnostics: FlagDiagnostic[] = [];
  const values: Record<string, boolean | string> = {};

  for (const [key, definition] of Object.entries(schema)) {
    if (definition.exposure === "server-only" && !input.includeServerOnly) {
      continue;
    }
    const evaluated = evaluateDefinition(definition, input.values[key]);
    values[key] = evaluated.value;
    if (evaluated.reason) {
      diagnostics.push({
        key,
        expected: expectedOf(definition),
        reason: evaluated.reason,
        snapshotVersion: input.schemaVersion,
      });
    }
  }

  const snapshot: FlagSnapshot = {
    schemaVersion: input.schemaVersion,
    values,
  };
  if (input.evaluatedAt !== undefined) {
    snapshot.evaluatedAt = input.evaluatedAt;
  }
  if (input.identityKey !== undefined) {
    snapshot.identityKey = input.identityKey;
  }

  return { snapshot, diagnostics };
}

export function resolveSnapshot(
  schema: FlagSchema,
  schemaVersion: string,
  snapshot: unknown,
  options?: { identityKey?: string; includeServerOnly?: boolean }
): { snapshot?: FlagSnapshot; diagnostics: FlagDiagnostic[] } {
  if (snapshot === undefined || snapshot === null) {
    return { diagnostics: [] };
  }
  if (!isRecord(snapshot) || typeof snapshot.schemaVersion !== "string") {
    return {
      diagnostics: [
        {
          key: "*",
          expected: { type: "boolean" },
          reason: "malformed-snapshot",
        },
      ],
    };
  }
  if (snapshot.schemaVersion !== schemaVersion) {
    return {
      diagnostics: [
        {
          key: "*",
          expected: { type: "boolean" },
          reason: "incompatible-snapshot",
          snapshotVersion: snapshot.schemaVersion,
        },
      ],
    };
  }
  const snapshotIdentity =
    typeof snapshot.identityKey === "string" ? snapshot.identityKey : undefined;
  if (
    snapshotIdentity !== options?.identityKey &&
    (snapshotIdentity !== undefined || options?.identityKey !== undefined)
  ) {
    return {
      diagnostics: [
        {
          key: "*",
          expected: { type: "boolean" },
          reason: "identity-changed",
          snapshotVersion: snapshot.schemaVersion,
        },
      ],
    };
  }

  const rawValues = isRecord(snapshot.values) ? snapshot.values : {};
  return createFlagSnapshot(schema, {
    schemaVersion,
    values: rawValues,
    evaluatedAt:
      typeof snapshot.evaluatedAt === "string"
        ? snapshot.evaluatedAt
        : undefined,
    identityKey: snapshotIdentity ?? options?.identityKey,
    includeServerOnly: options?.includeServerOnly,
  });
}

export function readFlagValue(
  schema: FlagSchema,
  snapshot: FlagSnapshot | undefined,
  key: string
): { value: boolean | string; diagnostic?: FlagDiagnostic } {
  const definition = schema[key];
  if (!definition) {
    throw new Error(`Unknown feature flag: ${key}`);
  }
  const evaluated = evaluateDefinition(definition, snapshot?.values[key]);
  return {
    value: evaluated.value,
    diagnostic: evaluated.reason
      ? {
          key,
          expected: expectedOf(definition),
          reason: evaluated.reason,
          snapshotVersion: snapshot?.schemaVersion,
        }
      : undefined,
  };
}
