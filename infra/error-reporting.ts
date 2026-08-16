import {
  classifyError,
  isAbortError,
  type ClassifyErrorContext,
  type ErrorClassification,
  type RedactionPolicy,
} from "./error-classification";

export type ErrorReportContext = Record<string, unknown>;

export type ErrorReportFeedback = {
  message: string;
  email?: string;
};

export type ErrorReport = {
  reportId: string;
  timestamp: string;
  classification: ErrorClassification;
  environment?: string;
  route?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  context?: ErrorReportContext;
  feedback?: ErrorReportFeedback;
};

export type ErrorReporterAdapter = {
  report: (
    payload: ErrorReport,
    context?: { signal?: AbortSignal }
  ) => void | Promise<void>;
  flush?: (options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
  }) => void | Promise<void>;
};

export type CreateErrorReporterOptions = {
  adapter: ErrorReporterAdapter;
  enabled?: boolean;
  scope?: string;
  environment?: string;
  dedupeWindowMs?: number;
  maxContextKeys?: number;
  maxStringLength?: number;
  maxFeedbackLength?: number;
  flushTimeoutMs?: number;
  redaction?: RedactionPolicy;
  sensitiveKeys?: readonly string[];
  onAdapterError?: (error: unknown) => void;
  now?: () => number;
  createReportId?: () => string;
};

export type ReportOptions = {
  classification?: ErrorClassification;
  classifyContext?: ClassifyErrorContext;
  reportId?: string;
  route?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  context?: ErrorReportContext;
  feedback?: ErrorReportFeedback;
  consent?: boolean;
  signal?: AbortSignal;
};

export type ErrorReporterCoordinator = {
  scope: string;
  configure: (next: Partial<CreateErrorReporterOptions>) => void;
  report: (
    error: unknown,
    options?: ReportOptions
  ) => Promise<ErrorReport | null>;
  flush: (options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }) => Promise<void>;
  dispose: () => void;
};

const OMITTED = "[omitted]";
const DEFAULT_DEDUPE_WINDOW_MS = 60_000;
const DEFAULT_MAX_CONTEXT_KEYS = 16;
const DEFAULT_MAX_STRING_LENGTH = 200;
const DEFAULT_MAX_FEEDBACK_LENGTH = 2_000;
const DEFAULT_FLUSH_TIMEOUT_MS = 2_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
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
  "stack",
  "componentstack",
  "providerpayload",
  "provider_payload",
  "raw",
  "body",
  "request",
  "headers",
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
      value.length <= DEFAULT_MAX_CONTEXT_KEYS &&
      value.every((item) => isJsonPrimitive(item, maxStringLength))
    ) {
      return value;
    }
    return OMITTED;
  }
  return OMITTED;
}

function sanitizeContext(
  context: unknown,
  policy: {
    sensitiveKeys: readonly string[];
    maxStringLength: number;
    maxContextKeys: number;
  }
): ErrorReportContext | undefined {
  if (
    !isPlainObject(context) ||
    Object.getPrototypeOf(context) !== Object.prototype
  ) {
    return undefined;
  }

  const sanitized: ErrorReportContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (Object.keys(sanitized).length >= policy.maxContextKeys) {
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

function sanitizeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_ID.test(value) ? value : undefined;
}

function sanitizeBoundedString(
  value: unknown,
  maxLength: number
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return undefined;
  }
  return trimmed;
}

function sanitizeRoute(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("://")) {
    return undefined;
  }
  const pathOnly = trimmed.split("?")[0] ?? "";
  if (pathOnly.length === 0 || pathOnly.length > maxLength) {
    return undefined;
  }
  return pathOnly;
}

function sanitizeFeedback(
  feedback: ErrorReportFeedback | undefined,
  consent: boolean | undefined,
  maxFeedbackLength: number
): ErrorReportFeedback | undefined {
  if (!consent || !feedback) {
    return undefined;
  }
  const message = sanitizeBoundedString(feedback.message, maxFeedbackLength);
  if (!message) {
    return undefined;
  }
  const email = sanitizeBoundedString(feedback.email, 254);
  return email ? { message, email } : { message };
}

function createReportId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fingerprint(report: ErrorReport): string {
  return [
    report.classification.category,
    report.classification.code ?? "",
    report.classification.messageKey,
    report.route ?? "",
    report.operation ?? "",
  ].join("|");
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(new DOMException("Aborted", "AbortError"));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("flush timed out"));
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });

    work.then(
      (value) => {
        if (timer) {
          clearTimeout(timer);
        }
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (timer) {
          clearTimeout(timer);
        }
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export function createErrorReporter(
  options: CreateErrorReporterOptions
): ErrorReporterCoordinator {
  let current: CreateErrorReporterOptions = { ...options };
  const scope = () => current.scope ?? "default";
  const dedupeWindowMs = () =>
    current.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const maxContextKeys = () =>
    current.maxContextKeys ?? DEFAULT_MAX_CONTEXT_KEYS;
  const maxStringLength = () =>
    current.maxStringLength ??
    current.redaction?.maxStringLength ??
    DEFAULT_MAX_STRING_LENGTH;
  const maxFeedbackLength = () =>
    current.maxFeedbackLength ?? DEFAULT_MAX_FEEDBACK_LENGTH;
  const flushTimeoutMs = () =>
    current.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
  const sensitiveKeys = () => [
    ...(current.redaction?.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS),
    ...(current.sensitiveKeys ?? []),
  ];
  const now = () => (current.now ?? (() => Date.now()))();
  const nextReportId = () => (current.createReportId ?? createReportId)();

  let disposed = false;
  const recent = new Map<string, number>();
  const inflight = new Set<Promise<void>>();

  function prune(nowMs: number) {
    for (const [key, seenAt] of recent) {
      if (nowMs - seenAt > dedupeWindowMs()) {
        recent.delete(key);
      }
    }
  }

  function configure(next: Partial<CreateErrorReporterOptions>) {
    current = {
      ...current,
      ...next,
      adapter: next.adapter ?? current.adapter,
    };
  }

  async function report(
    error: unknown,
    reportOptions: ReportOptions = {}
  ): Promise<ErrorReport | null> {
    if (disposed || current.enabled !== true) {
      return null;
    }

    if (isAbortError(error, reportOptions.signal)) {
      return null;
    }

    const classification =
      reportOptions.classification ??
      classifyError(error, reportOptions.classifyContext);

    const route = sanitizeRoute(reportOptions.route, maxStringLength());
    const operation = sanitizeBoundedString(
      reportOptions.operation,
      maxStringLength()
    );
    const userId = sanitizeIdentifier(reportOptions.userId);
    const sessionId = sanitizeIdentifier(reportOptions.sessionId);

    const payload: ErrorReport = {
      reportId: reportOptions.reportId ?? nextReportId(),
      timestamp: new Date(now()).toISOString(),
      classification,
      ...(current.environment ? { environment: current.environment } : {}),
      ...(route ? { route } : {}),
      ...(operation ? { operation } : {}),
      ...(userId ? { userId } : {}),
      ...(sessionId ? { sessionId } : {}),
    };

    const context = sanitizeContext(reportOptions.context, {
      sensitiveKeys: sensitiveKeys(),
      maxStringLength: maxStringLength(),
      maxContextKeys: maxContextKeys(),
    });
    if (context) {
      payload.context = context;
    }

    const feedback = sanitizeFeedback(
      reportOptions.feedback,
      reportOptions.consent,
      maxFeedbackLength()
    );
    if (feedback) {
      payload.feedback = feedback;
    }

    // Raw errors stay in memory for this call only; never serialize stacks.
    void error;

    const nowMs = now();
    prune(nowMs);
    const key = fingerprint(payload);
    const lastSeen = recent.get(key);
    if (lastSeen !== undefined && nowMs - lastSeen <= dedupeWindowMs()) {
      return null;
    }
    recent.set(key, nowMs);

    const delivery = Promise.resolve(
      current.adapter.report(payload, { signal: reportOptions.signal })
    )
      .catch((adapterError: unknown) => {
        current.onAdapterError?.(adapterError);
      })
      .finally(() => {
        inflight.delete(delivery);
      });
    inflight.add(delivery);
    await delivery;

    return payload;
  }

  async function flush(
    flushOptions: {
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<void> {
    if (disposed) {
      return;
    }
    const timeoutMs = flushOptions.timeoutMs ?? flushTimeoutMs();
    const pending = Promise.allSettled([...inflight]);
    try {
      await withTimeout(
        pending.then(() => undefined),
        timeoutMs,
        flushOptions.signal
      );
      if (current.adapter.flush) {
        await withTimeout(
          Promise.resolve(
            current.adapter.flush({
              signal: flushOptions.signal,
              timeoutMs,
            })
          ),
          timeoutMs,
          flushOptions.signal
        );
      }
    } catch (adapterError) {
      current.onAdapterError?.(adapterError);
    }
  }

  function dispose() {
    disposed = true;
    recent.clear();
    inflight.clear();
  }

  return {
    get scope() {
      return scope();
    },
    configure,
    report,
    flush,
    dispose,
  };
}
