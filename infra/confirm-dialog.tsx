"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  classifyError,
  type ErrorClassification,
  type ErrorClassifier,
} from "@/infra/error-classification";
import type { OverlaySettlement } from "@/infra/modal-manager";
import {
  useModalManager,
  type ModalContentContext,
} from "@/infra/modal-manager-provider";

const DEFAULT_CONFIRM_LABEL = "Confirm";
const DEFAULT_CANCEL_LABEL = "Cancel";
const RETRY_LABEL = "Retry";
const PENDING_LABEL = "Working";
const DESTRUCTIVE_HINT = "This action is destructive.";

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ConfirmValidateResult = void | { error: ErrorClassification };

export type ConfirmActionRunner = {
  run: <T>(
    action: (input: { signal: AbortSignal }) => Promise<T>
  ) => Promise<T>;
};

export type ConfirmAndRunOptions<T> = ConfirmOptions & {
  onConfirm: (input: { signal: AbortSignal }) => Promise<T>;
  onValidate?: () => ConfirmValidateResult | Promise<ConfirmValidateResult>;
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: ErrorClassification) => void;
  onLogError?: (error: unknown) => void;
  abortable?: boolean;
  classifiers?: readonly ErrorClassifier[];
  actionRunner?: ConfirmActionRunner;
};

export type ConfirmAndRunResult<T> =
  | { status: "confirmed"; data: T }
  | { status: "cancelled" }
  | { status: "dismissed" }
  | { status: "error"; error: ErrorClassification };

export type ConfirmDialogApi = {
  confirm: (options: ConfirmOptions) => Promise<OverlaySettlement>;
  confirmAndRun: <T>(
    options: ConfirmAndRunOptions<T>
  ) => Promise<ConfirmAndRunResult<T>>;
};

function isAbortError(error: unknown, signal?: AbortSignal) {
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

function confirmDescription(options: ConfirmOptions): ReactNode {
  if (!options.description && !options.destructive) {
    return undefined;
  }
  return (
    <>
      {options.description}
      {options.destructive ? (
        <span className="sr-only">{DESTRUCTIVE_HINT}</span>
      ) : null}
    </>
  );
}

function ConfirmButtons({
  options,
  pending,
  error,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions & { abortable?: boolean };
  pending?: boolean;
  error?: ErrorClassification | null;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelDisabled = pending && !options.abortable;
  return (
    <AlertDialogFooter>
      <div aria-live="polite" aria-atomic="true">
        {pending ? PENDING_LABEL : null}
      </div>
      {error ? (
        <div role="alert">
          <p>{error.message}</p>
          {error.fieldErrors
            ? Object.entries(error.fieldErrors).map(([field, message]) => (
                <p key={field}>
                  {field}: {message}
                </p>
              ))
            : null}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={cancelDisabled}
        onClick={onCancel}
      >
        {options.cancelLabel ?? DEFAULT_CANCEL_LABEL}
      </Button>
      <Button
        type="button"
        variant={options.destructive ? "destructive" : "default"}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </AlertDialogFooter>
  );
}

function ConfirmBooleanBody({
  options,
  confirm,
  cancel,
}: {
  options: ConfirmOptions;
} & Pick<ModalContentContext, "confirm" | "cancel">) {
  return (
    <ConfirmButtons
      options={options}
      confirmLabel={options.confirmLabel ?? DEFAULT_CONFIRM_LABEL}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}

function ConfirmRunBody<T>({
  options,
  confirm,
  cancel,
  onOutcome,
}: {
  options: ConfirmAndRunOptions<T>;
  onOutcome: (result: ConfirmAndRunResult<T>) => void;
} & Pick<ModalContentContext, "confirm" | "cancel">) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorClassification | null>(null);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  async function runAttempt() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const invalid = await options.onValidate?.();
      if (invalid?.error) {
        setError(invalid.error);
        return;
      }
      const data = options.actionRunner
        ? await options.actionRunner.run(() =>
            options.onConfirm({ signal: controller.signal })
          )
        : await options.onConfirm({ signal: controller.signal });
      if (controller.signal.aborted) {
        onOutcome({ status: "cancelled" });
        cancel();
        return;
      }
      onOutcome({ status: "confirmed", data });
      confirm();
      try {
        await options.onSuccess?.(data);
      } catch (raw) {
        options.onLogError?.(raw);
      }
    } catch (raw) {
      if (isAbortError(raw, controller.signal)) {
        onOutcome({ status: "cancelled" });
        cancel();
        return;
      }
      options.onLogError?.(raw);
      const classified = classifyError(raw, {
        classifiers: options.classifiers,
      });
      setError(classified);
      options.onError?.(classified);
    } finally {
      inFlight.current = false;
      abortRef.current = null;
      setPending(false);
    }
  }

  function onCancel() {
    if (pending) {
      if (!options.abortable) {
        return;
      }
      abortRef.current?.abort();
      return;
    }
    onOutcome(error ? { status: "error", error } : { status: "cancelled" });
    cancel();
  }

  return (
    <ConfirmButtons
      options={options}
      pending={pending}
      error={error}
      confirmLabel={
        error ? RETRY_LABEL : (options.confirmLabel ?? DEFAULT_CONFIRM_LABEL)
      }
      onConfirm={() => {
        void runAttempt();
      }}
      onCancel={onCancel}
    />
  );
}

export function useConfirmDialog(): ConfirmDialogApi {
  const modals = useModalManager();

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      return modals.open({
        surface: "alert-dialog",
        title: options.title,
        description: confirmDescription(options),
        closeOnBackdrop: false,
        content: (context) => (
          <ConfirmBooleanBody
            options={options}
            confirm={context.confirm}
            cancel={context.cancel}
          />
        ),
      }).result;
    },
    [modals]
  );

  const confirmAndRun = useCallback(
    async <T,>(
      options: ConfirmAndRunOptions<T>
    ): Promise<ConfirmAndRunResult<T>> => {
      let outcome: ConfirmAndRunResult<T> | undefined;
      const handle = modals.open({
        surface: "alert-dialog",
        title: options.title,
        description: confirmDescription(options),
        closeOnEscape: false,
        closeOnBackdrop: false,
        content: (context) => (
          <ConfirmRunBody
            options={options}
            confirm={context.confirm}
            cancel={context.cancel}
            onOutcome={(result) => {
              outcome = result;
            }}
          />
        ),
      });
      const settlement = await handle.result;
      if (outcome) {
        return outcome;
      }
      if (settlement === "cancelled") {
        return { status: "cancelled" };
      }
      return { status: "dismissed" };
    },
    [modals]
  );

  return { confirm, confirmAndRun };
}
