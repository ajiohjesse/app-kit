import type { CompleteDocSlots } from "./complete-docs";

const reportExample = `"use client";

import { createErrorReporter } from "@/lib/error-reporting";

const reporter = createErrorReporter({
  enabled: true,
  environment: "production",
  adapter: {
    async report(payload) {
      await fetch("/api/errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  },
});

export async function reportChargeFailure(error: unknown) {
  await reporter.report(error, {
    classifyContext: { status: 503 },
    route: "/billing",
    operation: "charge",
    userId: "user_123", // opt-in sanitized string — not a Session
    context: { invoiceId: "inv_9" },
  });
}
`;

const adapterExample = `"use client";

import {
  ErrorReportingBoundary,
  ErrorReportingProvider,
} from "@/components/error-reporting-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ErrorReportingProvider
      enabled
      environment="production"
      adapter={{
        async report(payload, { signal } = {}) {
          await fetch("/api/errors", {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
        },
      }}
    >
      <ErrorReportingBoundary
        fallback={({ classification, reset }) => (
          <main>
            <h1>{classification.message}</h1>
            <button type="button" onClick={reset}>
              Try again
            </button>
          </main>
        )}
      >
        {children}
      </ErrorReportingBoundary>
    </ErrorReportingProvider>
  );
}
`;

const consentExample = `"use client";

import { useState } from "react";
import { useErrorReporting } from "@/components/error-reporting-provider";

export function FeedbackForm({ error }: { error: unknown }) {
  const { report } = useErrorReporting();
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "failed">("idle");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void report(error, {
          consent,
          feedback: { message },
        }).then((payload) => {
          setStatus(payload ? "sent" : "failed");
        });
      }}
    >
      <p>We send only the safe error report plus your note. No passwords.</p>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        Send this report
      </label>
      <button type="submit" disabled={!consent}>
        Submit feedback
      </button>
      {status === "sent" ? <p>Thanks — report sent.</p> : null}
      {status === "failed" ? <p>Could not send. Try again later.</p> : null}
    </form>
  );
}
`;

const spaRecipe = `"use client";

import {
  ErrorReportingBoundary,
  ErrorReportingProvider,
} from "@/components/error-reporting-provider";

export function SpaRoot({ children }: { children: React.ReactNode }) {
  return (
    <ErrorReportingProvider
      enabled
      adapter={{
        async report(payload) {
          await window.errorSink?.send(payload);
        },
      }}
    >
      <ErrorReportingBoundary
        fallback={({ classification, reset }) => (
          <main>
            <h1>{classification.message}</h1>
            <button type="button" onClick={reset}>
              Try again
            </button>
          </main>
        )}
      >
        {children}
      </ErrorReportingBoundary>
    </ErrorReportingProvider>
  );
}
`;

const errorRecipe = `"use client";

import { useEffect } from "react";
import { createErrorReporter } from "@/lib/error-reporting";

const reporter = createErrorReporter({
  enabled: true,
  adapter: {
    async report(payload) {
      await fetch("/api/errors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
});

export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    // report() classifies internally; do not call classifyError here.
    // For classified UI in SPAs, prefer ErrorReportingBoundary fallback.
    void reporter.report(error, { route: "/segment" });
  }, [error]);

  return (
    <main>
      <h1>Something went wrong. Try again.</h1>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
      <button type="button" onClick={() => reset()}>
        Re-render without refetch
      </button>
    </main>
  );
}
`;

const globalErrorRecipe = `"use client";

import { useEffect } from "react";
import { createErrorReporter } from "@/lib/error-reporting";

const reporter = createErrorReporter({
  enabled: true,
  adapter: {
    async report(payload) {
      await fetch("/api/errors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
});

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    void reporter.report(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <h1>Something went wrong. Try again.</h1>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
`;

export const errorReportingDocs: CompleteDocSlots = {
  preview: (
    <div className="usage-sketch">
      <p>
        <span className="mono">ErrorClassification</span>
        {" → "}
        <span className="mono">ErrorReport</span>
        {" → "}
        adapter
      </p>
      <p>Recovery (retry/reset) never waits on report delivery.</p>
    </div>
  ),
  examples: [
    { label: "report.ts", language: "typescript", code: reportExample },
    { label: "adapter.tsx", language: "tsx", code: adapterExample },
    { label: "consent.tsx", language: "tsx", code: consentExample },
  ],
  spaRecipes: [{ label: "spa-boundary.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "error.tsx", language: "tsx", code: errorRecipe },
    { label: "global-error.tsx", language: "tsx", code: globalErrorRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">ErrorReport</dt>
      <dd>
        Bounded redacted payload: <code>reportId</code>, <code>timestamp</code>,{" "}
        <code>classification</code>, optional environment/route/operation, and
        opt-in sanitized <code>userId</code>/<code>sessionId</code>. No raw
        stacks, cookies, tokens, or provider bodies by default.
      </dd>
      <dt className="mono">ErrorReporterAdapter</dt>
      <dd>
        Consumer boundary with <code>report(payload, context?)</code> and
        optional bounded <code>flush()</code>. App Kit installs no vendor SDK.
      </dd>
      <dt className="mono">createErrorReporter(options)</dt>
      <dd>
        Framework-neutral coordinator. Opt-in via <code>enabled</code>, dedupes
        by fingerprint + window, swallows adapter failures into{" "}
        <code>onAdapterError</code>, and never blocks recovery.
      </dd>
      <dt className="mono">ErrorReportingProvider / useErrorReporting()</dt>
      <dd>
        React wiring for the coordinator. Call <code>report()</code> or{" "}
        <code>flush()</code> from consumer UI.
      </dd>
      <dt className="mono">ErrorReportingBoundary</dt>
      <dd>
        SPA error boundary that classifies once, fires <code>report()</code>{" "}
        without awaiting it for recovery, and renders a consumer-owned fallback
        with the same <code>ErrorClassification</code> plus <code>reset()</code>
        . Aborts are not reported.
      </dd>
      <dt className="mono">Report consent</dt>
      <dd>
        Feedback fields attach only when <code>consent: true</code>. Consent
        copy and form chrome stay consumer-owned — no dialog/textarea registry
        dependency.
      </dd>
    </dl>
  ),
  limitations: [
    "Next.js error.tsx and global-error.tsx recipes are documentation-only; they are not installed into app/.",
    "Primary recovery is retry() (re-fetch then re-render). reset() only re-renders without refetching.",
    "Reporting must not wait on retry() or reset(). Flush has a bounded timeout and cannot delay recovery.",
    "Authentication-core is not a hard dependency; user/session identifiers are opt-in sanitized strings.",
    "Feedback UI is consumer-owned. Hard dialog/textarea registry dependencies are not required.",
  ],
};
