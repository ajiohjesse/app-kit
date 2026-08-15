import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import {
  CommandDestructiveConfirmRequiredError,
  CommandPaletteHost,
  CommandPaletteProvider,
  CommandRegistration,
  CommandRegistrationError,
  useCommandPalette,
  useCommandRegistration,
  type CommandConfirmAdapter,
} from "../../infra/command-palette";
import {
  ModalManager,
  ModalManagerProvider,
} from "../../infra/modal-manager-provider";
import { ShortcutRegistryProvider } from "../../infra/keyboard-shortcuts";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}

function Host({
  children,
  confirm,
}: {
  children?: ReactNode;
  confirm?: CommandConfirmAdapter;
}) {
  return (
    <ShortcutRegistryProvider platform="windows">
      <ModalManagerProvider>
        <CommandPaletteProvider confirm={confirm}>
          <ModalManager />
          <CommandPaletteHost />
          {children}
        </CommandPaletteProvider>
      </ModalManagerProvider>
    </ShortcutRegistryProvider>
  );
}

describe("command registration", () => {
  it("registers via useCommandRegistration and cleans up on unmount", async () => {
    const run = vi.fn();

    function Probe() {
      useCommandRegistration({ id: "go-home", title: "Go home", run });
      return null;
    }

    function Capture() {
      const { listCommands, execute } = useCommandPalette();
      return (
        <div>
          <span data-testid="ids">
            {listCommands()
              .map((command) => command.id)
              .join(",")}
          </span>
          <button
            type="button"
            onClick={() => {
              void execute("go-home");
            }}
          >
            run-home
          </button>
        </div>
      );
    }

    const { rerender } = render(
      <Host>
        <Probe />
        <Capture />
      </Host>
    );

    await waitFor(() => {
      expect(screen.getByTestId("ids")).toHaveTextContent("go-home");
    });

    await act(async () => {
      screen.getByRole("button", { name: "run-home" }).click();
    });
    expect(run).toHaveBeenCalledTimes(1);

    rerender(
      <Host>
        <Capture />
      </Host>
    );

    await waitFor(() => {
      expect(screen.getByTestId("ids")).toHaveTextContent("");
    });
  }, 15_000);

  it("registers via CommandRegistration and imperative registerCommand", async () => {
    const runA = vi.fn();
    const runB = vi.fn();

    function Imperative() {
      const { registerCommand, listCommands } = useCommandPalette();
      useEffect(() => {
        return registerCommand({
          id: "imperative",
          title: "Imperative",
          run: runB,
        });
      }, [registerCommand]);
      return <span data-testid="count">{String(listCommands().length)}</span>;
    }

    render(
      <Host>
        <CommandRegistration
          command={{ id: "declarative", title: "Declarative", run: runA }}
        />
        <Imperative />
      </Host>
    );

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    });
  });

  it("rejects duplicate ids unless replace: true", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const errors: unknown[] = [];

    function Dupes({ replace }: { replace?: boolean }) {
      const { registerCommand } = useCommandPalette();
      useEffect(() => {
        const unregisterFirst = registerCommand({
          id: "dup",
          title: "First",
          run: first,
        });
        try {
          registerCommand({
            id: "dup",
            title: "Second",
            run: second,
            replace,
          });
        } catch (error) {
          errors.push(error);
        }
        return unregisterFirst;
      }, [registerCommand, replace]);
      return null;
    }

    const { unmount } = render(
      <Host>
        <Dupes />
      </Host>
    );

    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0]).toBeInstanceOf(CommandRegistrationError);
    unmount();

    errors.length = 0;
    render(
      <Host>
        <Dupes replace />
      </Host>
    );

    await waitFor(() => {
      expect(errors).toHaveLength(0);
    });
  });

  it("does not throw duplicate-id on Strict Mode remount", () => {
    function Probe() {
      useCommandRegistration({
        id: "strict-safe",
        title: "Strict safe",
        run: () => {},
      });
      return null;
    }

    expect(() =>
      render(
        <StrictMode>
          <Host>
            <Probe />
          </Host>
        </StrictMode>
      )
    ).not.toThrow();
  });
});

describe("modal host", () => {
  it("opens one dialog containing Command via modal-manager", async () => {
    function Probe() {
      useCommandRegistration({
        id: "inbox",
        title: "Go to inbox",
        run: () => {},
      });
      const { open } = useCommandPalette();
      return (
        <button type="button" onClick={() => open()}>
          open
        </button>
      );
    }

    render(
      <Host>
        <Probe />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open" }).click();
    });

    expect(
      screen.getByRole("dialog", { name: "Command palette" })
    ).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Go to inbox")).toBeVisible();
  });
});

describe("destructive fail-closed", () => {
  it("does not run a destructive command when confirm is missing", async () => {
    const run = vi.fn();
    const results: unknown[] = [];

    function Probe() {
      useCommandRegistration({
        id: "delete",
        title: "Delete",
        destructive: true,
        run,
      });
      const { execute } = useCommandPalette();
      return (
        <button
          type="button"
          onClick={() => {
            void execute("delete")
              .then((result) => results.push(result))
              .catch((error) => results.push(error));
          }}
        >
          go
        </button>
      );
    }

    render(
      <Host>
        <Probe />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "go" }).click();
    });

    await waitFor(() => {
      expect(results).toHaveLength(1);
    });
    expect(run).not.toHaveBeenCalled();
    expect(results[0]).toBeInstanceOf(CommandDestructiveConfirmRequiredError);
  });

  it("runs destructive command only after confirm settles confirmed", async () => {
    const run = vi.fn();
    const confirm = vi.fn(async () => "confirmed" as const);

    function Probe() {
      useCommandRegistration({
        id: "delete",
        title: "Delete project",
        destructive: true,
        run,
      });
      const { execute } = useCommandPalette();
      return (
        <button
          type="button"
          onClick={() => {
            void execute("delete");
          }}
        >
          go
        </button>
      );
    }

    render(
      <Host confirm={{ confirm }}>
        <Probe />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "go" }).click();
    });

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("does not run when confirm is cancelled", async () => {
    const run = vi.fn();
    const confirm = vi.fn(async () => "cancelled" as const);

    function Probe() {
      useCommandRegistration({
        id: "delete",
        title: "Delete",
        destructive: true,
        run,
      });
      const { execute } = useCommandPalette();
      return (
        <button
          type="button"
          onClick={() => {
            void execute("delete");
          }}
        >
          go
        </button>
      );
    }

    render(
      <Host confirm={{ confirm }}>
        <Probe />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "go" }).click();
    });

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });
    expect(run).not.toHaveBeenCalled();
  });
});
