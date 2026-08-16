import {
  classifyError,
  createClassifier,
  isAbortError,
  resolveAsyncFailureKind,
} from "../../infra/error-classification";

describe("classifyError", () => {
  it("returns a safe unknown classification when nothing is recognized", () => {
    const result = classifyError(new Error("ECONNRESET secret-token=abc"));

    expect(result).toEqual({
      category: "unknown",
      message: "Something went wrong. Try again.",
      messageKey: "error/unknown",
      retryable: false,
    });
    expect(result).not.toMatchObject({
      message: expect.stringContaining("secret-token"),
    });
  });

  it("treats an ErrorClassification as identity (no double wrap)", () => {
    const classified = classifyError(new Error("ignored"), { status: 503 });
    const again = classifyError(classified);

    expect(again).toBe(classified);
    expect(again.message).toBe(
      "The service is temporarily unavailable. Try again."
    );
  });

  it.each([
    [400, "validation", false, "Check the highlighted fields and try again."],
    [422, "validation", false, "Check the highlighted fields and try again."],
    [401, "authentication", false, "Sign in to continue."],
    [403, "authorization", false, "You do not have permission to do that."],
    [404, "not-found", false, "We could not find what you were looking for."],
    [
      409,
      "conflict",
      false,
      "That change could not be saved because the data has changed.",
    ],
    [408, "timeout", true, "The request timed out. Try again."],
    [504, "timeout", true, "The request timed out. Try again."],
    [
      429,
      "rate-limited",
      true,
      "Too many requests. Wait a moment and try again.",
    ],
    [
      500,
      "unavailable",
      true,
      "The service is temporarily unavailable. Try again.",
    ],
    [
      503,
      "unavailable",
      true,
      "The service is temporarily unavailable. Try again.",
    ],
    [418, "unknown", false, "Something went wrong. Try again."],
  ] as const)("maps HTTP %i to %s", (status, category, retryable, message) => {
    expect(classifyError(new Error("raw provider body"), { status })).toEqual({
      category,
      message,
      messageKey: `error/${category}`,
      retryable,
    });
  });

  it("maps a normalized network failure to unavailable", () => {
    expect(
      classifyError(new TypeError("Failed to fetch"), {
        networkFailure: true,
      })
    ).toEqual({
      category: "unavailable",
      message: "The service is temporarily unavailable. Try again.",
      messageKey: "error/unavailable",
      retryable: true,
    });
  });

  it("maps a caller abort to cancelled with a redacted code", () => {
    expect(classifyError(new DOMException("Aborted", "AbortError"))).toEqual({
      category: "cancelled",
      message: "The request was cancelled.",
      messageKey: "error/cancelled",
      retryable: false,
      code: "aborted",
    });
  });

  it("maps an explicit timeout signal to timeout with a redacted code", () => {
    expect(classifyError(new DOMException("Timeout", "TimeoutError"))).toEqual({
      category: "timeout",
      message: "The request timed out. Try again.",
      messageKey: "error/timeout",
      retryable: true,
      code: "timeout",
    });
  });

  it("does not infer a category from free-form error text", () => {
    expect(classifyError(new Error("request timeout after abort"))).toEqual({
      category: "unknown",
      message: "Something went wrong. Try again.",
      messageKey: "error/unknown",
      retryable: false,
    });
  });

  it("does not inspect Response-like errors for a status", () => {
    const response = { status: 401, headers: { authorization: "Bearer abc" } };
    expect(classifyError(response).category).toBe("unknown");
  });

  it("lets HTTP status win over abort and timeout signals", () => {
    const error = new DOMException("Aborted", "AbortError");
    expect(classifyError(error, { status: 503 }).category).toBe("unavailable");
  });

  it("lets a provider-code classifier win over HTTP status", () => {
    const result = classifyError(new Error("ignored"), {
      status: 500,
      providerCode: "INVALID_INPUT",
      classifiers: [
        (_error, context) =>
          context.providerCode === "INVALID_INPUT"
            ? {
                category: "validation",
                message: "Email is already registered.",
                messageKey: "error/validation",
                retryable: false,
              }
            : undefined,
      ],
    });

    expect(result).toEqual({
      category: "validation",
      message: "Email is already registered.",
      messageKey: "error/validation",
      retryable: false,
    });
  });

  it("defers to built-in mapping when a classifier returns undefined", () => {
    const result = classifyError(new Error("ignored"), {
      status: 404,
      classifiers: [() => undefined],
    });

    expect(result.category).toBe("not-found");
  });

  it("allows a classifier to override retryability", () => {
    const result = classifyError(new Error("ignored"), {
      status: 503,
      classifiers: [
        () => ({
          category: "unavailable",
          message: "The service is temporarily unavailable. Try again.",
          messageKey: "error/unavailable",
          retryable: false,
        }),
      ],
    });

    expect(result.retryable).toBe(false);
  });

  it("returns safe unknown when a classifier throws", () => {
    const result = classifyError(new Error("ignored"), {
      status: 401,
      classifiers: [
        () => {
          throw new Error("classifier exploded: token=super-secret");
        },
      ],
    });

    expect(result).toEqual({
      category: "unknown",
      message: "Something went wrong. Try again.",
      messageKey: "error/unknown",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("keeps field errors only on validation classifications", () => {
    const validation = classifyError(new Error("ignored"), {
      classifiers: [
        () => ({
          category: "validation",
          message: "Check the highlighted fields and try again.",
          messageKey: "error/validation",
          retryable: false,
          fieldErrors: { email: "Already registered." },
        }),
      ],
    });
    const auth = classifyError(new Error("ignored"), {
      classifiers: [
        () => ({
          category: "authentication",
          message: "Sign in to continue.",
          messageKey: "error/authentication",
          retryable: false,
          fieldErrors: { email: "Already registered." },
        }),
      ],
    });

    expect(validation.fieldErrors).toEqual({ email: "Already registered." });
    expect(auth.fieldErrors).toBeUndefined();
  });

  it("redacts sensitive keys, cycles, class instances, and oversized values", () => {
    const cycle: Record<string, unknown> = { ok: "keep" };
    cycle.self = cycle;
    const result = classifyError(new Error("ignored"), {
      classifiers: [
        () => ({
          category: "unknown",
          message: "Something went wrong. Try again.",
          messageKey: "error/unknown",
          retryable: false,
          code: "provider/token=super-secret",
          details: {
            ok: "keep",
            password: "hunter2",
            token: "abc",
            nested: { leaked: "no" },
            klass: new Date("2026-01-01"),
            oversized: "x".repeat(201),
            cycle,
          },
        }),
      ],
    });

    expect(result.details).toEqual({
      ok: "keep",
      password: "[omitted]",
      token: "[omitted]",
      nested: "[omitted]",
      klass: "[omitted]",
      oversized: "[omitted]",
      cycle: "[omitted]",
    });
    expect(result.code).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("does not mutate the original error or context", () => {
    const error = { name: "Error", extra: { token: "abc" } };
    const classifiers = [() => undefined];
    const context = {
      status: 401,
      providerCode: "X",
      classifiers,
    };
    const errorSnapshot = structuredClone(error);
    const contextSnapshot = {
      status: 401,
      providerCode: "X",
    };

    classifyError(error, context);

    expect(error).toEqual(errorSnapshot);
    expect(context.status).toBe(contextSnapshot.status);
    expect(context.providerCode).toBe(contextSnapshot.providerCode);
    expect(context.classifiers).toBe(classifiers);
  });
});

describe("createClassifier", () => {
  it("binds classifiers for later calls", () => {
    const classify = createClassifier([
      (_error, context) =>
        context.providerCode === "PLAN_LIMIT"
          ? {
              category: "rate-limited",
              message: "Too many requests. Wait a moment and try again.",
              messageKey: "error/rate-limited",
              retryable: true,
            }
          : undefined,
    ]);

    expect(
      classify(new Error("ignored"), { providerCode: "PLAN_LIMIT" }).category
    ).toBe("rate-limited");
    expect(classify(new Error("ignored"), { status: 404 }).category).toBe(
      "not-found"
    );
  });
});

describe("isAbortError", () => {
  it("detects AbortError by name", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
  });

  it("treats an aborted signal as abort even without an error", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(undefined, controller.signal)).toBe(true);
    expect(isAbortError(new Error("other"), controller.signal)).toBe(true);
  });
});

describe("resolveAsyncFailureKind", () => {
  it("prefers timeout when the host timed out then aborted", () => {
    const error = new DOMException("Aborted", "AbortError");
    expect(resolveAsyncFailureKind(error, { timedOut: true })).toBe("timeout");
    expect(resolveAsyncFailureKind(error)).toBe("cancelled");
    expect(resolveAsyncFailureKind(new Error("boom"))).toBe("failure");
  });
});

describe("error-classification module", () => {
  it("imports neither Next.js nor UI", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const source = await readFile(
      join(process.cwd(), "infra/error-classification.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/from\s+["']next(?:\/|$)/);
    expect(source).not.toMatch(/from\s+["']react(?:\/|$)/);
    expect(source).not.toMatch(/from\s+["']@\/components/);
    expect(source).not.toMatch(/from\s+["']@\/ui/);
  });
});
