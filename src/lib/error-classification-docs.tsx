import type { CompleteDocSlots } from "./complete-docs";
import { classifyError } from "../../infra/error-classification";

const usage = `import { classifyError } from "@/lib/error-classification";

export function noticeFor(error: unknown, status?: number) {
  const classified = classifyError(error, {
    status,
    classifiers: [
      (_error, context) =>
        context.providerCode === "INVALID_INPUT"
          ? {
              category: "validation",
              message: "Email is already registered.",
              messageKey: "error/validation",
              retryable: false,
              fieldErrors: { email: "Already registered." },
            }
          : undefined,
    ],
  });

  return classified.message;
}
`;

const spaRecipe = `"use client";

import { useState } from "react";
import { classifyError } from "@/lib/error-classification";

export function SaveButton({ save }: { save: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          try {
            await save();
            setMessage(null);
          } catch (error) {
            setMessage(classifyError(error).message);
          }
        }}
      >
        Save
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
`;

const errorRecipe = `"use client";

import { classifyError } from "@/lib/error-classification";

export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry: () => void;
  reset: () => void;
}) {
  const classified = classifyError(error);

  return (
    <main>
      <h1>{classified.message}</h1>
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

import { classifyError } from "@/lib/error-classification";

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const classified = classifyError(error);

  return (
    <html lang="en">
      <body>
        <h1>{classified.message}</h1>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
`;

const samples = [
  { label: "401", result: classifyError(new Error(), { status: 401 }) },
  { label: "503", result: classifyError(new Error(), { status: 503 }) },
  {
    label: "AbortError",
    result: classifyError(new DOMException("Aborted", "AbortError")),
  },
];

export const errorClassificationDocs: CompleteDocSlots = {
  preview: (
    <div className="usage-sketch">
      {samples.map((sample) => (
        <p key={sample.label}>
          <span className="mono">{sample.label}</span>
          {" → "}
          {sample.result.category}
          {sample.result.retryable ? " · retryable" : ""}
        </p>
      ))}
    </div>
  ),
  examples: [
    { label: "classify-error.ts", language: "typescript", code: usage },
  ],
  spaRecipes: [{ label: "save-button.tsx", language: "tsx", code: spaRecipe }],
  nextRecipes: [
    { label: "error.tsx", language: "tsx", code: errorRecipe },
    { label: "global-error.tsx", language: "tsx", code: globalErrorRecipe },
  ],
  api: (
    <dl className="api-list">
      <dt className="mono">ErrorClassification</dt>
      <dd>
        Public error model: <code>category</code>, safe <code>message</code>,{" "}
        <code>messageKey</code>, <code>retryable</code>, optional redacted{" "}
        <code>code</code>, allowlisted <code>details</code>, and validation-only{" "}
        <code>fieldErrors</code>. No raw cause, stack, or provider payload.
      </dd>
      <dt className="mono">ErrorCategory</dt>
      <dd>
        Closed taxonomy: <code>validation</code>, <code>authentication</code>,{" "}
        <code>authorization</code>, <code>not-found</code>,{" "}
        <code>conflict</code>, <code>rate-limited</code>,{" "}
        <code>unavailable</code>, <code>cancelled</code>, <code>timeout</code>,{" "}
        <code>unknown</code>.
      </dd>
      <dt className="mono">classifyError(error, context?)</dt>
      <dd>
        Pure mapper from <code>unknown</code> plus optional HTTP status,
        provider code, abort/timeout/network flags, redaction policy, and
        ordered classifiers. Provider-code classifiers run first, then HTTP,
        then abort/timeout, then <code>unknown</code>.
      </dd>
      <dt className="mono">createClassifier(classifiers)</dt>
      <dd>
        Returns a <code>classifyError</code> function with bound classifiers.
        Per-call <code>context.classifiers</code> replace the bound list.
      </dd>
      <dt className="mono">Retryability defaults</dt>
      <dd>
        False for validation, authentication, authorization, not-found,
        conflict, cancelled, and unknown. True for unavailable, timeout, and
        rate-limited. Classifiers may override.
      </dd>
    </dl>
  ),
  limitations: [
    "Next.js error.tsx and global-error.tsx recipes are documentation-only; they are not installed into app/.",
    "Primary recovery is retry() (re-fetch then re-render). reset() only re-renders without refetching.",
    "Classification does not redirect, call notFound, report errors, or change authentication.",
    "The core does not inspect Response objects or parse bodies. Adapters pass normalized context.",
    "Free-form error messages are never used as a category signal.",
  ],
};
