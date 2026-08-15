"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useModalManager,
  type ModalContentContext,
} from "@/infra/modal-manager-provider";

const DEFAULT_ACKNOWLEDGE_LABEL = "OK";
const DEFAULT_SUBMIT_LABEL = "Submit";
const DEFAULT_CANCEL_LABEL = "Cancel";
const DEFAULT_INPUT_LABEL = "Value";
const SAFE_INPUT_ERROR = "Enter a valid value.";

export type AlertVariant = "neutral" | "warning" | "error";

const VARIANT_HINT: Record<Exclude<AlertVariant, "neutral">, string> = {
  warning: "This is a warning.",
  error: "This is an error.",
};

export type AlertOptions = {
  title: ReactNode;
  description?: ReactNode;
  acknowledgeLabel?: string;
  variant?: AlertVariant;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
};

export type AlertResult = "acknowledged" | "dismissed";

export type PromptValidateResult = void | { error: string };

export type PromptOptions<T = string> = {
  title: ReactNode;
  description?: ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  trim?: boolean;
  validate?: (
    value: string
  ) => PromptValidateResult | Promise<PromptValidateResult>;
  parse?: (value: string) => T | Promise<T>;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  initialFocus?: "input" | "submit";
};

export type PromptResult<T = string> =
  { status: "submitted"; value: T } | { status: "dismissed" };

export type AlertPromptDialogApi = {
  alert: (options: AlertOptions) => Promise<AlertResult>;
  prompt: <T = string>(options: PromptOptions<T>) => Promise<PromptResult<T>>;
};

function alertDescription(options: AlertOptions): ReactNode {
  const variant = options.variant ?? "neutral";
  const hint = variant === "neutral" ? null : VARIANT_HINT[variant];
  if (!options.description && !hint) {
    return undefined;
  }
  return (
    <>
      {options.description}
      {hint ? <span className="sr-only">{hint}</span> : null}
    </>
  );
}

function AlertBody({
  options,
  confirm,
}: {
  options: AlertOptions;
} & Pick<ModalContentContext, "confirm">) {
  const variant = options.variant ?? "neutral";
  const acknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acknowledgeRef.current?.focus();
  }, []);

  return (
    <AlertDialogFooter
      data-variant={variant}
      className={
        variant === "error"
          ? "text-destructive"
          : variant === "warning"
            ? "text-muted-foreground"
            : undefined
      }
    >
      <Button type="button" ref={acknowledgeRef} onClick={confirm}>
        {options.acknowledgeLabel ?? DEFAULT_ACKNOWLEDGE_LABEL}
      </Button>
    </AlertDialogFooter>
  );
}

function PromptBody<T>({
  options,
  confirm,
  close,
  onOutcome,
}: {
  options: PromptOptions<T>;
  onOutcome: (result: PromptResult<T>) => void;
} & Pick<ModalContentContext, "confirm" | "close">) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(options.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const inputLabel = options.label ?? DEFAULT_INPUT_LABEL;
  const dismissible = options.dismissible ?? true;

  useEffect(() => {
    if (options.initialFocus === "submit") {
      submitRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
  }, [options.initialFocus]);

  async function submit() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    const submittedValue = options.trim ? value.trim() : value;
    try {
      try {
        const invalid = await options.validate?.(submittedValue);
        if (invalid?.error) {
          setError(invalid.error);
          return;
        }
      } catch {
        setError(SAFE_INPUT_ERROR);
        return;
      }
      try {
        const parsed = options.parse
          ? await options.parse(submittedValue)
          : (submittedValue as T);
        onOutcome({ status: "submitted", value: parsed });
        confirm();
      } catch {
        setError(SAFE_INPUT_ERROR);
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {inputLabel}
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          value={value}
          placeholder={options.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? (
          <div id={errorId} role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <DialogFooter>
        {dismissible ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOutcome({ status: "dismissed" });
              close("dismissed");
            }}
          >
            {options.cancelLabel ?? DEFAULT_CANCEL_LABEL}
          </Button>
        ) : null}
        <Button
          type="submit"
          ref={submitRef}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {options.submitLabel ?? DEFAULT_SUBMIT_LABEL}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function useAlertPromptDialog(): AlertPromptDialogApi {
  const modals = useModalManager();

  const alert = useCallback(
    async (options: AlertOptions): Promise<AlertResult> => {
      const settlement = await modals.open({
        surface: "alert-dialog",
        title: options.title,
        description: alertDescription(options),
        closeOnEscape: options.closeOnEscape ?? false,
        closeOnBackdrop: options.closeOnBackdrop ?? false,
        content: (context) => (
          <AlertBody options={options} confirm={context.confirm} />
        ),
      }).result;
      return settlement === "confirmed" ? "acknowledged" : "dismissed";
    },
    [modals]
  );

  const prompt = useCallback(
    async <T = string,>(
      options: PromptOptions<T>
    ): Promise<PromptResult<T>> => {
      let outcome: PromptResult<T> | undefined;
      const dismissible = options.dismissible ?? true;
      const handle = modals.open({
        surface: "dialog",
        title: options.title,
        description: options.description,
        closeOnEscape: options.closeOnEscape ?? dismissible,
        closeOnBackdrop: options.closeOnBackdrop ?? false,
        dismissible,
        content: (context) => (
          <PromptBody
            options={options}
            confirm={context.confirm}
            close={context.close}
            onOutcome={(result) => {
              outcome = result;
            }}
          />
        ),
      });
      await handle.result;
      return outcome ?? { status: "dismissed" };
    },
    [modals]
  );

  return { alert, prompt };
}
