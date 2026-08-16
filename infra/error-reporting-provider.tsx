"use client";

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  classifyError,
  type ErrorClassification,
} from "@/infra/error-classification";
import {
  createErrorReporter,
  type CreateErrorReporterOptions,
  type ErrorReport,
  type ErrorReporterCoordinator,
  type ReportOptions,
} from "@/infra/error-reporting";

export type ErrorReportingContextValue = {
  reporter: ErrorReporterCoordinator;
  report: (
    error: unknown,
    options?: ReportOptions
  ) => Promise<ErrorReport | null>;
  flush: ErrorReporterCoordinator["flush"];
};

const ErrorReportingContext = createContext<ErrorReportingContextValue | null>(
  null
);

export type ErrorReportingProviderProps = CreateErrorReporterOptions & {
  children: ReactNode;
};

export function ErrorReportingProvider({
  children,
  adapter,
  enabled,
  scope,
  environment,
  dedupeWindowMs,
  maxContextKeys,
  maxStringLength,
  maxFeedbackLength,
  flushTimeoutMs,
  redaction,
  sensitiveKeys,
  onAdapterError,
  now,
  createReportId,
}: ErrorReportingProviderProps) {
  const [reporter] = useState(() =>
    createErrorReporter({
      adapter,
      enabled,
      scope,
      environment,
      dedupeWindowMs,
      maxContextKeys,
      maxStringLength,
      maxFeedbackLength,
      flushTimeoutMs,
      redaction,
      sensitiveKeys,
      onAdapterError,
      now,
      createReportId,
    })
  );

  useEffect(() => {
    reporter.configure({
      adapter,
      enabled,
      scope,
      environment,
      dedupeWindowMs,
      maxContextKeys,
      maxStringLength,
      maxFeedbackLength,
      flushTimeoutMs,
      redaction,
      sensitiveKeys,
      onAdapterError,
      now,
      createReportId,
    });
  }, [
    adapter,
    createReportId,
    dedupeWindowMs,
    enabled,
    environment,
    flushTimeoutMs,
    maxContextKeys,
    maxFeedbackLength,
    maxStringLength,
    now,
    onAdapterError,
    redaction,
    reporter,
    scope,
    sensitiveKeys,
  ]);

  useEffect(() => () => reporter.dispose(), [reporter]);

  const report = useCallback(
    (error: unknown, reportOptions?: ReportOptions) =>
      reporter.report(error, reportOptions),
    [reporter]
  );

  const flush = useCallback(
    (flushOptions?: { timeoutMs?: number; signal?: AbortSignal }) =>
      reporter.flush(flushOptions),
    [reporter]
  );

  const value = useMemo<ErrorReportingContextValue>(
    () => ({
      reporter,
      report,
      flush,
    }),
    [flush, report, reporter]
  );

  return (
    <ErrorReportingContext.Provider value={value}>
      {children}
    </ErrorReportingContext.Provider>
  );
}

export function useErrorReporting(): ErrorReportingContextValue {
  const value = useContext(ErrorReportingContext);
  if (!value) {
    throw new Error(
      "useErrorReporting must be used within ErrorReportingProvider"
    );
  }
  return value;
}

export type ErrorBoundaryFallbackProps = {
  error: unknown;
  classification: ErrorClassification;
  reset: () => void;
};

export type ErrorReportingBoundaryProps = {
  children: ReactNode;
  fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
  reportOptions?: Omit<ReportOptions, "classification">;
  onError?: (error: unknown, info: ErrorInfo) => void;
  reporter?: ErrorReporterCoordinator;
};

type BoundaryState = {
  error: unknown | null;
  classification: ErrorClassification | null;
};

type BoundaryProps = {
  children: ReactNode;
  fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
  reportOptions?: Omit<ReportOptions, "classification">;
  onError?: (error: unknown, info: ErrorInfo) => void;
  reporter: ErrorReporterCoordinator | null;
};

class ErrorReportingBoundaryInner extends Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null, classification: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      error,
      classification: classifyError(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
    const classification = classifyError(
      error,
      this.props.reportOptions?.classifyContext
    );
    if (classification !== this.state.classification) {
      this.setState({ classification });
    }
    const reporter = this.props.reporter;
    if (!reporter) {
      return;
    }
    // Recovery must not wait on delivery. Abort is skipped inside report().
    void reporter.report(error, {
      ...this.props.reportOptions,
      classification,
    });
  }

  reset = () => {
    this.setState({ error: null, classification: null });
  };

  render() {
    if (this.state.error != null && this.state.classification != null) {
      return this.props.fallback({
        error: this.state.error,
        classification: this.state.classification,
        reset: this.reset,
      });
    }
    return this.props.children;
  }
}

export function ErrorReportingBoundary({
  children,
  fallback,
  reportOptions,
  onError,
  reporter: reporterProp,
}: ErrorReportingBoundaryProps) {
  const context = useContext(ErrorReportingContext);
  const reporter = reporterProp ?? context?.reporter ?? null;

  return (
    <ErrorReportingBoundaryInner
      reporter={reporter}
      fallback={fallback}
      reportOptions={reportOptions}
      onError={onError}
    >
      {children}
    </ErrorReportingBoundaryInner>
  );
}
