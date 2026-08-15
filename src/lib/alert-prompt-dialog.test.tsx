import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { useAlertPromptDialog } from "../../infra/alert-prompt-dialog";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";

function Host({ children }: { children?: ReactNode }) {
  return (
    <ModalManagerProvider>
      <ModalManager />
      {children}
    </ModalManagerProvider>
  );
}

describe("alert() resolve and dismiss", () => {
  it("settles acknowledged or dismissed and uses one alert-dialog host", async () => {
    const results: string[] = [];

    function Capture() {
      const { alert } = useAlertPromptDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void alert({ title: "Saved" }).then((value) => {
              results.push(value);
            });
          }}
        >
          show
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "show" }).click();
    });
    expect(screen.getByRole("alertdialog", { name: "Saved" })).toBeVisible();
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);

    await act(async () => {
      screen.getByRole("button", { name: "OK" }).click();
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "show" }).click();
    });
    await act(async () => {
      screen
        .getByRole("alertdialog", { name: "Saved" })
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
    });
    expect(screen.getByRole("alertdialog", { name: "Saved" })).toBeVisible();
    expect(results).toEqual(["acknowledged"]);
  });

  it("announces warning and error variants without changing settlement", async () => {
    let result: string | undefined;

    function Capture() {
      const { alert } = useAlertPromptDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void alert({
              title: "Broken",
              variant: "error",
            }).then((value) => {
              result = value;
            });
          }}
        >
          show
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "show" }).click();
    });
    expect(screen.getByText("This is an error.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();

    await act(async () => {
      screen.getByRole("button", { name: "OK" }).click();
    });
    expect(result).toBe("acknowledged");
  });

  it("dismisses when escape is enabled", async () => {
    let result: string | undefined;

    function Capture() {
      const { alert } = useAlertPromptDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void alert({ title: "Notice", closeOnEscape: true }).then(
              (value) => {
                result = value;
              }
            );
          }}
        >
          show
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "show" }).click();
    });
    await act(async () => {
      screen
        .getByRole("alertdialog", { name: "Notice" })
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
    });

    await waitFor(() => {
      expect(result).toBe("dismissed");
    });
  });
});

describe("prompt() resolve, dismiss, and validate", () => {
  it("distinguishes a submitted empty string from dismissal", async () => {
    const results: unknown[] = [];

    function Capture() {
      const { prompt } = useAlertPromptDialog();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void prompt({ title: "Rename" }).then((value) => {
                results.push(value);
              });
            }}
          >
            ask
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
      screen.getByRole("button", { name: "ask" }).click();
    });
    expect(screen.getByRole("dialog", { name: "Rename" })).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("textbox")).toHaveValue("");

    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });

    expect(results).toEqual([
      { status: "submitted", value: "" },
      { status: "dismissed" },
    ]);
  });

  it("keeps the entered value and blocks submit when validate returns an error", async () => {
    const results: unknown[] = [];
    const calls: string[] = [];

    function Capture() {
      const { prompt } = useAlertPromptDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void prompt({
              title: "Team name",
              defaultValue: "alpha",
              validate: (value) => {
                calls.push(value);
                if (value === "alpha") {
                  return { error: "Name is taken." };
                }
              },
            }).then((value) => {
              results.push(value);
            });
          }}
        >
          ask
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Name is taken.");
    });
    expect(screen.getByRole("textbox")).toHaveValue("alpha");
    expect(screen.getByRole("dialog", { name: "Team name" })).toBeVisible();
    expect(calls).toEqual(["alpha"]);
    expect(results).toEqual([]);

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "beta" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(results).toEqual([{ status: "submitted", value: "beta" }]);
  });

  it("parses after validation and keeps parser failures in the dialog", async () => {
    const results: unknown[] = [];

    function Capture() {
      const { prompt } = useAlertPromptDialog();
      return (
        <button
          type="button"
          onClick={() => {
            void prompt({
              title: "Age",
              parse: (value) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 1) {
                  throw new Error("RAW_PARSE_SECRET");
                }
                return parsed;
              },
            }).then((value) => {
              results.push(value);
            });
          }}
        >
          ask
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "nope" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText("RAW_PARSE_SECRET")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("nope");
    expect(results).toEqual([]);

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "21" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });

    await waitFor(() => {
      expect(results).toEqual([{ status: "submitted", value: 21 }]);
    });
  });

  it("disables submit while validation is pending and ignores a second submit", async () => {
    let release!: () => void;
    const calls: string[] = [];

    function Capture() {
      const { prompt } = useAlertPromptDialog();
      const started = useRef(false);
      return (
        <button
          type="button"
          onClick={() => {
            void prompt({
              title: "Slug",
              validate: () =>
                new Promise((resolve) => {
                  if (started.current) {
                    calls.push("duplicate");
                  }
                  started.current = true;
                  calls.push("validate");
                  release = () => resolve(undefined);
                }),
            });
          }}
        >
          ask
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "ask" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();

    await act(async () => {
      screen.getByRole("button", { name: "Submit" }).click();
    });
    expect(calls).toEqual(["validate"]);

    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
