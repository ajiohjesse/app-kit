import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import type { OverlaySettlement } from "../../infra/modal-manager";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";
import { useConfirmDialog } from "../../infra/confirm-dialog";
import type { ErrorClassification } from "../../infra/error-classification";

function Host({ children }: { children?: ReactNode }) {
  return (
    <ModalManagerProvider>
      <ModalManager />
      {children}
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

describe("confirmAndRun() classified errors", () => {
  it("keeps the dialog open, shows ErrorClassification, and never renders raw exception text", async () => {
    const SECRET = "RAW_EXCEPTION_SECRET_xyz";
    const logs: unknown[] = [];
    const errors: ErrorClassification[] = [];
    let result: unknown;

    function Capture() {
      const { confirmAndRun } = useConfirmDialog();
      const attempts = useRef(0);
      return (
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
                attempts.current += 1;
                if (attempts.current === 1) {
                  throw new Error(SECRET);
                }
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
      screen.getByRole("button", { name: "Confirm" }).click();
    });

    expect(
      screen.getByRole("alertdialog", { name: "Save draft?" })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong. Try again."
      );
    });
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.category).toBe("unknown");
    expect(errors[0]?.message).toBe("Something went wrong. Try again.");
    expect(logs).toEqual([expect.any(Error)]);
    expect((logs[0] as Error).message).toBe(SECRET);

    await act(async () => {
      screen.getByRole("button", { name: "Retry" }).click();
    });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(result).toEqual({ status: "confirmed", data: "saved" });
  });

  it("returns classified error status when the user cancels after a failed attempt", async () => {
    let result: unknown;

    function Capture() {
      const { confirmAndRun } = useConfirmDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void confirmAndRun({
              title: "Save draft?",
              onLogError: () => {},
              onConfirm: async () => {
                throw new Error("RAW_EXCEPTION_SECRET_xyz");
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
      screen.getByRole("button", { name: "Confirm" }).click();
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });
    await waitFor(() => {
      expect(result).toMatchObject({
        status: "error",
        error: {
          category: "unknown",
          message: "Something went wrong. Try again.",
        },
      });
    });
  });

  it("disables cancel while pending and skips onConfirm when validation fails", async () => {
    let release!: () => void;
    const calls: string[] = [];
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
        <>
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
              });
            }}
          >
            validate
          </button>
          <button
            type="button"
            onClick={() => {
              void confirmAndRun({
                title: "Export?",
                onConfirm: () =>
                  new Promise((resolve) => {
                    calls.push("pending");
                    release = () => resolve("ok");
                  }),
              });
            }}
          >
            hang
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
      screen.getByRole("button", { name: "validate" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Confirm" }).click();
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
    });
    expect(screen.getByText("name: Required")).toBeInTheDocument();
    expect(calls).toEqual(["validate"]);

    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "hang" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Confirm" }).click();
    });
    await waitFor(() => {
      expect(screen.getByText("Working")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
