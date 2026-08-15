"use client";

import { useState } from "react";
import {
  ErrorReportingBoundary,
  ErrorReportingProvider,
} from "../../../infra/error-reporting-provider";

function Boom({ armed }: { armed: boolean }) {
  if (armed) {
    throw new Error("error-reporting-smoke");
  }
  return <p data-testid="recovered">Recovered without waiting on report</p>;
}

export default function ErrorReportingSmokePage() {
  const [armed, setArmed] = useState(true);
  const [reportStarted, setReportStarted] = useState(false);
  const [reportFinished, setReportFinished] = useState(false);

  return (
    <main>
      <h1>error-reporting smoke</h1>
      <p data-testid="report-started">{reportStarted ? "yes" : "no"}</p>
      <p data-testid="report-finished">{reportFinished ? "yes" : "no"}</p>
      <ErrorReportingProvider
        enabled
        adapter={{
          async report() {
            setReportStarted(true);
            await new Promise<void>(() => {
              // Never resolves — recovery must not wait.
            });
            setReportFinished(true);
          },
        }}
      >
        <ErrorReportingBoundary
          fallback={({ classification, reset }) => (
            <div>
              <h2>{classification.message}</h2>
              <button
                type="button"
                onClick={() => {
                  setArmed(false);
                  reset();
                }}
              >
                Try again
              </button>
            </div>
          )}
        >
          <Boom armed={armed} />
        </ErrorReportingBoundary>
      </ErrorReportingProvider>
    </main>
  );
}
