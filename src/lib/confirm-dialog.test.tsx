import { act, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import type { OverlaySettlement } from "../../infra/modal-manager";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";
import {
  ActionRunnerProvider,
  useActionRunner,
} from "../../infra/action-runner";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "../../infra/confirm-dialog";
import type { ErrorClassification } from "../../infra/error-classification";

function Host({ children }: { children?: ReactNode }) {
  return (
    <ModalManagerProvider>
      <ModalManager />
      <ConfirmDialogProvider>
        <ActionRunnerProvider>{children}</ActionRunnerProvider>
      </ConfirmDialogProvider>
    </ModalManagerProvider>
  );
}

describe("confirm() settlement", () => {
  it("settles confirmed, cancelled, and dismissed as OverlaySettlement", async () => {
    const settlements: OverlaySettlement[] = [];

    function Capture() {
      const { confirm } = useConfirmDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void confirm({ title: "Delete file?" }).then((value) => {
              settlements.push(value);
            });
          }}
        >
          ask
        </button>
      );
    }

    const { unmount } = render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    expect(
      screen.getByRole("alertdialog", { name: "Delete file?" })
    ).toBeVisible();
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);

    await act(async () => {
      screen.getByRole("button", { name: "Confirm" }).click();
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      screen
        .getByRole("alertdialog", { name: "Delete file?" })
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
    });

    expect(settlements).toEqual(["confirmed", "cancelled", "dismissed"]);
    unmount();
  });
});

describe("confirmAndRun() via Action runner", () => {
  it("returns classified error after confirm and closes the dialog", async () => {
    const SECRET = "RAW_EXCEPTION_SECRET_xyz";
    const logs: unknown[] = [];
    const errors: ErrorClassification[] = [];
    let result: unknown;

    function Capture() {
      const { confirmAndRun } = useConfirmDialog();
      const { state } = useActionRunner();
      return (
        <>
          <span data-testid="runner-status">{state.status}</span>
          <span data-testid="runner-error">{state.error?.message ?? ""}</span>
          <button
            type="button"
            onClick={() => {
              void confirmAndRun({
                title: "Save draft?",
                onLogError: (error) => {
                  logs.push(error);
                },
                onError: (error) => {
                  errors.push(error);
                },
                onConfirm: async () => {
                  throw new Error(SECRET);
                },
              }).then((value) => {
                result = value;
              });
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Confirm" }).click();
    });

    await waitFor(() => {
      expect(result).toMatchObject({
        status: "error",
        error: {
          category: "unknown",
          message: "Something went wrong. Try again.",
        },
      });
      expect(screen.getByTestId("runner-status")).toHaveTextContent("failed");
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(errors).toHaveLength(1);
    expect(logs).toEqual([expect.any(Error)]);
    expect((logs[0] as Error).message).toBe(SECRET);
  });

  it("returns cancelled when confirm is dismissed", async () => {
    let result: unknown;
    let invoked = false;

    function Capture() {
      const { confirmAndRun } = useConfirmDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void confirmAndRun({
              title: "Save draft?",
              onConfirm: async () => {
                invoked = true;
                return "saved";
              },
            }).then((value) => {
              result = value;
            });
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });

    await waitFor(() => {
      expect(result).toEqual({ status: "cancelled" });
    });
    expect(invoked).toBe(false);
  });

  it("skips onConfirm when validation fails before confirm", async () => {
    const calls: string[] = [];
    let result: unknown;
    const validation: ErrorClassification = {
      category: "validation",
      message: "Name is required.",
      messageKey: "error/validation",
      retryable: false,
      fieldErrors: { name: "Required" },
    };

    function Capture() {
      const { confirmAndRun } = useConfirmDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void confirmAndRun({
              title: "Rename?",
              onValidate: () => {
                calls.push("validate");
                return { error: validation };
              },
              onConfirm: async () => {
                calls.push("confirm");
                return "done";
              },
            }).then((value) => {
              result = value;
            });
          }}
        >
          validate
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "validate" }).click();
    });

    await waitFor(() => {
      expect(result).toEqual({ status: "error", error: validation });
    });
    expect(calls).toEqual(["validate"]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
