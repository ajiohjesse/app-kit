import { createErrorReporter } from "../../infra/error-reporting";
import type {
  ErrorReport,
  ErrorReporterAdapter,
} from "../../infra/error-reporting";

function createRecordingAdapter() {
  const payloads: ErrorReport[] = [];
  const adapter: ErrorReporterAdapter = {
    async report(payload) {
      payloads.push(payload);
    },
  };
  return { adapter, payloads };
}

describe("createErrorReporter", () => {
  it("sends a redacted allowlisted report without secrets, stacks, or provider payloads", async () => {
    const { adapter, payloads } = createRecordingAdapter();
    const reporter = createErrorReporter({
      adapter,
      enabled: true,
      environment: "test",
      createReportId: () => "report-1",
      now: () => Date.parse("2026-08-15T12:00:00.000Z"),
    });

    const report = await reporter.report(
      new Error("ECONNRESET secret-token=abc\n    at secret.ts:1"),
      {
        classifyContext: { status: 503 },
        route: "/billing",
        operation: "charge",
        userId: "user_123",
        sessionId: "sess_456",
        context: {
          authorization: "Bearer leak",
          cookie: "session=raw",
          providerPayload: { raw: "body" },
          safeNote: "ok",
        },
      }
    );

    expect(report).toMatchObject({
      reportId: "report-1",
      timestamp: "2026-08-15T12:00:00.000Z",
      environment: "test",
      route: "/billing",
      operation: "charge",
      userId: "user_123",
      sessionId: "sess_456",
      classification: {
        category: "unavailable",
        message: "The service is temporarily unavailable. Try again.",
        messageKey: "error/unavailable",
        retryable: true,
      },
    });
    expect(JSON.stringify(report)).not.toMatch(
      /secret-token|Bearer leak|session=raw/
    );
    expect(report?.context).toEqual({
      authorization: "[omitted]",
      cookie: "[omitted]",
      providerPayload: "[omitted]",
      safeNote: "ok",
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual(report);
  });

  it("dedupes repeated reports within the configured window", async () => {
    const { adapter, payloads } = createRecordingAdapter();
    let now = 1_000;
    const reporter = createErrorReporter({
      adapter,
      enabled: true,
      dedupeWindowMs: 5_000,
      createReportId: () => `report-${payloads.length + 1}`,
      now: () => now,
    });

    const first = await reporter.report(new Error("boom"), {
      classifyContext: { status: 500 },
      operation: "save",
    });
    const duplicate = await reporter.report(new Error("boom again"), {
      classifyContext: { status: 500 },
      operation: "save",
    });

    now = 7_000;
    const afterWindow = await reporter.report(new Error("boom later"), {
      classifyContext: { status: 500 },
      operation: "save",
    });

    expect(first?.reportId).toBe("report-1");
    expect(duplicate).toBeNull();
    expect(afterWindow?.reportId).toBe("report-2");
    expect(payloads).toHaveLength(2);
  });

  it("swallows adapter failures and never replaces the original report result", async () => {
    const diagnostics: unknown[] = [];
    const reporter = createErrorReporter({
      adapter: {
        async report() {
          throw new Error("adapter exploded with secret=xyz");
        },
      },
      enabled: true,
      createReportId: () => "report-safe",
      now: () => Date.parse("2026-08-15T12:00:00.000Z"),
      onAdapterError: (error) => {
        diagnostics.push(error);
      },
    });

    await expect(
      reporter.report(new Error("original"), {
        classifyContext: { status: 500 },
      })
    ).resolves.toMatchObject({
      reportId: "report-safe",
      classification: { category: "unavailable" },
    });

    expect(diagnostics).toHaveLength(1);
    expect(String(diagnostics[0])).toContain("adapter exploded");
  });

  it("does not report when reporting is disabled", async () => {
    const { adapter, payloads } = createRecordingAdapter();
    const reporter = createErrorReporter({
      adapter,
      enabled: false,
    });

    await expect(
      reporter.report(new Error("ignored"), {
        classifyContext: { status: 500 },
      })
    ).resolves.toBeNull();
    expect(payloads).toHaveLength(0);
  });

  it("does not report until enabled is explicitly true", async () => {
    const { adapter, payloads } = createRecordingAdapter();
    const reporter = createErrorReporter({ adapter });

    await expect(
      reporter.report(new Error("ignored"), {
        classifyContext: { status: 500 },
      })
    ).resolves.toBeNull();
    expect(payloads).toHaveLength(0);
  });

  it("attaches feedback only when consent is true", async () => {
    const { adapter, payloads } = createRecordingAdapter();
    const reporter = createErrorReporter({
      adapter,
      enabled: true,
      createReportId: () => "report-consent",
      now: () => Date.parse("2026-08-15T12:00:00.000Z"),
    });

    await reporter.report(new Error("boom"), {
      classifyContext: { status: 500 },
      feedback: { message: "button looked broken", email: "a@example.com" },
    });
    await reporter.report(new Error("boom"), {
      classifyContext: { status: 404 },
      consent: true,
      feedback: { message: "button looked broken", email: "a@example.com" },
    });

    expect(payloads[0]).not.toHaveProperty("feedback");
    expect(payloads[1]?.feedback).toEqual({
      message: "button looked broken",
      email: "a@example.com",
    });
  });
});
