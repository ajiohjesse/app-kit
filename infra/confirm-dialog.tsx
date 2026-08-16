"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ErrorClassification } from "@/infra/error-classification";
import {
  useOptionalActionRunner,
  type ActionConfirmAdapter,
  type ActionRunOptions,
} from "@/infra/action-runner";
import type { OverlaySettlement } from "@/infra/modal-manager";
import {
  useModalManager,
  type ModalContentContext,
  type ModalManagerApi,
} from "@/infra/modal-manager-provider";

const DEFAULT_CONFIRM_LABEL = "Confirm";
const DEFAULT_CANCEL_LABEL = "Cancel";
const DESTRUCTIVE_HINT = "This action is destructive.";

const ACTION_CONFIRM_ADAPTER_SLOT = Symbol.for(
  "app-kit.action-confirm-adapter"
);

function getActionConfirmAdapterContext() {
  const holder = globalThis as typeof globalThis & {
    [ACTION_CONFIRM_ADAPTER_SLOT]?: ReturnType<
      typeof createContext<ActionConfirmAdapter | null>
    >;
  };
  if (!holder[ACTION_CONFIRM_ADAPTER_SLOT]) {
    holder[ACTION_CONFIRM_ADAPTER_SLOT] =
      createContext<ActionConfirmAdapter | null>(null);
  }
  return holder[ACTION_CONFIRM_ADAPTER_SLOT];
}

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ConfirmValidateResult = void | { error: ErrorClassification };

export type ConfirmAndRunOptions<T> = ConfirmOptions & {
  onConfirm: (input: { signal: AbortSignal }) => Promise<T>;
  onValidate?: () => ConfirmValidateResult | Promise<ConfirmValidateResult>;
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: ErrorClassification) => void;
  onLogError?: (error: unknown) => void;
  classifiers?: ActionRunOptions["classifiers"];
  blocking?: ActionRunOptions["blocking"];
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

const ConfirmFnContext = createContext<ConfirmDialogApi["confirm"] | null>(
  null
);

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
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {options.cancelLabel ?? DEFAULT_CANCEL_LABEL}
      </Button>
      <Button
        type="button"
        variant={options.destructive ? "destructive" : "default"}
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

function createConfirm(modals: ModalManagerApi): ConfirmDialogApi["confirm"] {
  return (options: ConfirmOptions) => {
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
  };
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const modals = useModalManager();
  const confirm = useMemo(() => createConfirm(modals), [modals]);
  const ActionConfirmAdapterContext = getActionConfirmAdapterContext();
  const adapter = useMemo<ActionConfirmAdapter>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmFnContext.Provider value={confirm}>
      <ActionConfirmAdapterContext.Provider value={adapter}>
        {children}
      </ActionConfirmAdapterContext.Provider>
    </ConfirmFnContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmDialogApi {
  const modals = useModalManager();
  const providedConfirm = useContext(ConfirmFnContext);
  const runner = useOptionalActionRunner();

  const confirm = useMemo(
    () => providedConfirm ?? createConfirm(modals),
    [providedConfirm, modals]
  );

  const confirmAndRun = useCallback(
    async <T,>(
      options: ConfirmAndRunOptions<T>
    ): Promise<ConfirmAndRunResult<T>> => {
      if (!runner) {
        throw new Error(
          "confirmAndRun() requires an ActionRunnerProvider ancestor."
        );
      }

      const invalid = await options.onValidate?.();
      if (invalid?.error) {
        return { status: "error", error: invalid.error };
      }

      let classified: ErrorClassification | undefined;
      let cancelled = false;

      try {
        const data = await runner.run(
          (context) => options.onConfirm({ signal: context.signal }),
          {
            confirm: {
              title: options.title,
              description: options.description,
              confirmLabel: options.confirmLabel,
              cancelLabel: options.cancelLabel,
              destructive: options.destructive,
            },
            blocking: options.blocking,
            classifiers: options.classifiers,
            onSuccess: options.onSuccess
              ? (value) => {
                  void options.onSuccess?.(value as T);
                }
              : undefined,
            onError: (error) => {
              classified = error;
              options.onError?.(error);
            },
            onCancelled: () => {
              cancelled = true;
            },
            onLogError: options.onLogError,
          }
        );
        return { status: "confirmed", data };
      } catch {
        if (classified) {
          return { status: "error", error: classified };
        }
        if (cancelled) {
          return { status: "cancelled" };
        }
        return { status: "cancelled" };
      }
    },
    [runner]
  );

  return useMemo(() => ({ confirm, confirmAndRun }), [confirm, confirmAndRun]);
}
