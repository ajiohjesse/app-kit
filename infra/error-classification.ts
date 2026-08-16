export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "unavailable"
  | "cancelled"
  | "timeout"
  | "unknown";

export type ErrorClassification = {
  category: ErrorCategory;
  message: string;
  messageKey: string;
  retryable: boolean;
  code?: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
};

export type ErrorClassifier = (
  error: unknown,
  context: ClassifyErrorContext
) => ErrorClassification | undefined;

export type RedactionPolicy = {
  sensitiveKeys?: readonly string[];
  maxStringLength?: number;
  maxDetailKeys?: number;
};

export type ClassifyErrorContext = {
  status?: number;
  providerCode?: string;
  operation?: string;
  networkFailure?: boolean;
  aborted?: boolean;
  timeout?: boolean;
  classifiers?: readonly ErrorClassifier[];
  redaction?: RedactionPolicy;
};

const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "unavailable",
  "timeout",
  "rate-limited",
]);

const HTTP_CATEGORY: Record<number, ErrorCategory> = {
  400: "validation",
  422: "validation",
  401: "authentication",
  403: "authorization",
  404: "not-found",
  409: "conflict",
  408: "timeout",
  504: "timeout",
  429: "rate-limited",
};

const SAFE_MESSAGES: Record<ErrorCategory, string> = {
  validation: "Check the highlighted fields and try again.",
  authentication: "Sign in to continue.",
  authorization: "You do not have permission to do that.",
  "not-found": "We could not find what you were looking for.",
  conflict: "That change could not be saved because the data has changed.",
  "rate-limited": "Too many requests. Wait a moment and try again.",
  unavailable: "The service is temporarily unavailable. Try again.",
  cancelled: "The request was cancelled.",
  timeout: "The request timed out. Try again.",
  unknown: "Something went wrong. Try again.",
};

function classification(
  category: ErrorCategory,
  extras: Pick<ErrorClassification, "code"> = {}
): ErrorClassification {
  return {
    category,
    message: SAFE_MESSAGES[category],
    messageKey: `error/${category}`,
    retryable: RETRYABLE_CATEGORIES.has(category),
    ...extras,
  };
}

function errorName(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

function categoryFromStatus(status: number): ErrorCategory | undefined {
  if (status in HTTP_CATEGORY) {
    return HTTP_CATEGORY[status];
  }
  if (status >= 500 && status <= 599) {
    return "unavailable";
  }
  return undefined;
}

const CATEGORIES: ReadonlySet<string> = new Set<ErrorCategory>([
  "validation",
  "authentication",
  "authorization",
  "not-found",
  "conflict",
  "rate-limited",
  "unavailable",
  "cancelled",
  "timeout",
  "unknown",
]);

const OMITTED = "[omitted]";
const DEFAULT_MAX_STRING_LENGTH = 200;
const DEFAULT_MAX_DETAIL_KEYS = 16;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const DEFAULT_SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "set_cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "credential",
  "credentials",
  "private_key",
  "session",
  "ssn",
  "bearer",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll("-", "_");
}

function isSensitiveKey(
  key: string,
  sensitiveKeys: readonly string[]
): boolean {
  const normalized = normalizeKey(key);
  return sensitiveKeys.some((candidate) => {
    const needle = normalizeKey(candidate);
    return normalized === needle || normalized.includes(needle);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown, maxStringLength: number): boolean {
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return value.length <= maxStringLength;
  }
  return false;
}

function sanitizeValue(value: unknown, maxStringLength: number): unknown {
  if (isJsonPrimitive(value, maxStringLength)) {
    return value;
  }
  if (Array.isArray(value)) {
    if (
      value.length <= DEFAULT_MAX_DETAIL_KEYS &&
      value.every((item) => isJsonPrimitive(item, maxStringLength))
    ) {
      return value;
    }
    return OMITTED;
  }
  return OMITTED;
}

function redactCode(code: unknown): string | undefined {
  return typeof code === "string" && SAFE_CODE.test(code) ? code : undefined;
}

function sanitizeDetails(
  details: unknown,
  policy: Required<
    Pick<RedactionPolicy, "maxStringLength" | "maxDetailKeys">
  > & {
    sensitiveKeys: readonly string[];
  }
): Record<string, unknown> | undefined {
  if (
    !isPlainObject(details) ||
    Object.getPrototypeOf(details) !== Object.prototype
  ) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (Object.keys(sanitized).length >= policy.maxDetailKeys) {
      break;
    }
    if (isSensitiveKey(key, policy.sensitiveKeys)) {
      sanitized[key] = OMITTED;
      continue;
    }
    sanitized[key] = sanitizeValue(value, policy.maxStringLength);
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeFieldErrors(
  fieldErrors: unknown,
  maxStringLength: number
): Record<string, string> | undefined {
  if (!isPlainObject(fieldErrors)) {
    return undefined;
  }
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxStringLength
    ) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function resolvePolicy(redaction: RedactionPolicy = {}): {
  sensitiveKeys: readonly string[];
  maxStringLength: number;
  maxDetailKeys: number;
} {
  return {
    sensitiveKeys: redaction.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
    maxStringLength: redaction.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    maxDetailKeys: redaction.maxDetailKeys ?? DEFAULT_MAX_DETAIL_KEYS,
  };
}

/**
 * Host-only abort detector (DOMException name or aborted signal).
 * Not an app-facing seam — async-work modules import this; app code should not.
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Host-only abort vs timeout protocol.
 * When a host aborts due to timeoutMs, pass timedOut: true so timeout wins over cancel.
 */
export function resolveAsyncFailureKind(
  error: unknown,
  options: { signal?: AbortSignal; timedOut?: boolean } = {}
): "timeout" | "cancelled" | "failure" {
  const aborted = isAbortError(error, options.signal);
  if (aborted && options.timedOut) {
    return "timeout";
  }
  if (aborted) {
    return "cancelled";
  }
  return "failure";
}

function isErrorClassification(value: unknown): value is ErrorClassification {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.category === "string" &&
    CATEGORIES.has(value.category) &&
    typeof value.message === "string" &&
    typeof value.messageKey === "string" &&
    typeof value.retryable === "boolean"
  );
}

function fromClassifierResult(
  result: ErrorClassification,
  redaction?: RedactionPolicy
): ErrorClassification {
  const policy = resolvePolicy(redaction);
  const category = CATEGORIES.has(result.category)
    ? result.category
    : "unknown";
  const classified = classification(category);
  const code = redactCode(result.code);
  const details = sanitizeDetails(result.details, policy);
  const fieldErrors =
    category === "validation"
      ? sanitizeFieldErrors(result.fieldErrors, policy.maxStringLength)
      : undefined;
  const message =
    typeof result.message === "string" &&
    result.message.length > 0 &&
    result.message.length <= policy.maxStringLength
      ? result.message
      : classified.message;

  return {
    ...classified,
    message,
    retryable: result.retryable,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

export function classifyError(
  error: unknown,
  context: ClassifyErrorContext = {}
): ErrorClassification {
  if (isErrorClassification(error)) {
    return error;
  }

  if (context.classifiers) {
    try {
      for (const classifier of context.classifiers) {
        const result = classifier(error, context);
        if (result) {
          return fromClassifierResult(result, context.redaction);
        }
      }
    } catch {
      return classification("unknown");
    }
  }

  if (typeof context.status === "number") {
    return classification(categoryFromStatus(context.status) ?? "unknown");
  }
  if (context.networkFailure) {
    return classification("unavailable");
  }

  const name = errorName(error);
  if (context.timeout || name === "TimeoutError") {
    return classification("timeout", { code: "timeout" });
  }
  if (context.aborted || name === "AbortError") {
    return classification("cancelled", { code: "aborted" });
  }

  return classification("unknown");
}

export function createClassifier(
  classifiers: readonly ErrorClassifier[]
): (error: unknown, context?: ClassifyErrorContext) => ErrorClassification {
  return (error, context = {}) =>
    classifyError(error, {
      ...context,
      classifiers: context.classifiers ?? classifiers,
    });
}
