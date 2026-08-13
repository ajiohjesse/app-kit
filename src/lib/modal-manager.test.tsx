import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect, useState, type ReactNode } from "react";
import type {
  OverlayLayerKind,
  OverlaySettlement,
} from "../../infra/modal-manager";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
  useOverlayLayer,
} from "../../infra/modal-manager-provider";

function Host({ children }: { children?: ReactNode }) {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        {children}
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}

function OpenButton({
  title,
  surface = "dialog",
  closeOnEscape,
  closeOnBackdrop,
  dismissible,
  onOpen,
  onClose,
}: {
  title: string;
  surface?: "dialog" | "alert-dialog";
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  onOpen?: () => void | Promise<void>;
  onClose?: (settlement: OverlaySettlement) => void | Promise<void>;
}) {
  const modals = useModalManager();
  return (
    <button
      type="button"
      onClick={() => {
        void modals.open({
          surface,
          title,
          closeOnEscape,
          closeOnBackdrop,
          dismissible,
          onOpen,
          onClose,
          content: ({ close, confirm, cancel }) => (
            <div>
              <p>{title} body</p>
              <button type="button" onClick={() => confirm()}>
                confirm {title}
              </button>
              <button type="button" onClick={() => cancel()}>
                cancel {title}
              </button>
              <button type="button" onClick={() => close()}>
                dismiss {title}
              </button>
              <button
                type="button"
                onClick={() => {
                  void modals.open({
                    title: `${title} nested`,
                    content: ({ close: closeNested }) => (
                      <button type="button" onClick={() => closeNested()}>
                        dismiss {title} nested
                      </button>
                    ),
                  });
                }}
              >
                stack on {title}
              </button>
            </div>
          ),
        });
      }}
    >
      open {title}
    </button>
  );
}

function LayerProbe({
  id,
  kind,
  autoForeground = true,
}: {
  id: string;
  kind: OverlayLayerKind;
  autoForeground?: boolean;
}) {
  const overlay = useOverlayLayer();
  const [status, setStatus] = useState("active");

  useEffect(() => {
    return overlay.registerLayer({
      id,
      kind,
      getRestoreTarget: () => document.getElementById(`${id}-restore`),
      onSuspend: () => setStatus("suspended"),
      onResume: () => setStatus("active"),
    });
  }, [id, kind, overlay]);

  useEffect(() => {
    if (autoForeground) {
      overlay.setForeground(id);
    }
  }, [autoForeground, id, overlay]);

  return (
    <div>
      <button type="button" id={`${id}-restore`}>
        {id} restore
      </button>
      <span data-testid={`${id}-status`}>{status}</span>
    </div>
  );
}

describe("OverlaySettlement", () => {
  it("is owned by the lib surface as confirmed | cancelled | dismissed", () => {
    const owned: OverlaySettlement[] = ["confirmed", "cancelled", "dismissed"];
    expect(owned).toEqual(["confirmed", "cancelled", "dismissed"]);
  });
});

describe("modal stack", () => {
  it("opens a LIFO stack of nested dialogs and settles close as dismissed", async () => {
    const settlements: OverlaySettlement[] = [];
    function Capture() {
      const modals = useModalManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = modals.open({
              title: "first",
              content: ({ close }) => (
                <button type="button" onClick={() => close()}>
                  dismiss first
                </button>
              ),
            });
            void handle.result.then((value) => settlements.push(value));
          }}
        >
          open first
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open first" }).click();
    });
    expect(screen.getByRole("dialog", { name: "first" })).toBeVisible();

    await act(async () => {
      screen.getByRole("button", { name: "dismiss first" }).click();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(settlements).toEqual(["dismissed"]);
  });

  it("keeps the lower dialog mounted and inert while a nested dialog is on top", async () => {
    render(
      <Host>
        <OpenButton title="bottom" />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open bottom" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "stack on bottom" }).click();
    });

    const bottomTitle = screen.getByRole("heading", {
      name: "bottom",
      hidden: true,
    });
    const bottom = bottomTitle.closest('[role="dialog"]');
    const top = screen.getByRole("dialog", { name: "bottom nested" });
    expect(top).toBeVisible();
    expect(top).toHaveAttribute("data-nested");
    expect(bottom).toHaveAttribute("data-nested-dialog-open");
    expect(
      bottom?.hasAttribute("inert") ||
        bottom?.getAttribute("aria-hidden") === "true" ||
        bottom?.hasAttribute("data-base-ui-inert")
    ).toBe(true);
  });

  it("replace keeps the lower stack slot and resets the replaced entry", async () => {
    const settlements: OverlaySettlement[] = [];
    function Capture() {
      const modals = useModalManager();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const first = modals.open({
                title: "one",
                content: "one body",
              });
              void first.result.then((value) => settlements.push(value));
              const nested = modals.open({
                title: "two",
                content: "two body",
              });
              void nested.result.then((value) => settlements.push(value));
              const replaced = modals.replace(nested.id, {
                title: "two-b",
                content: "two-b body",
              });
              document.getElementById("replaced-id")!.textContent =
                replaced.id === nested.id ? "same" : "new";
            }}
          >
            run replace
          </button>
          <span id="replaced-id" />
        </>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run replace" }).click();
    });

    expect(
      screen.getByRole("heading", { name: "one", hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "two-b" })).toBeInTheDocument();
    expect(document.getElementById("replaced-id")).toHaveTextContent("same");
    expect(
      screen.queryByRole("heading", { name: "two", hidden: true })
    ).not.toBeInTheDocument();
    expect(settlements).toEqual(["dismissed"]);
  });

  it("settles confirm and cancel from the content context", async () => {
    const settlements: OverlaySettlement[] = [];
    function Capture() {
      const modals = useModalManager();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void modals
                .open({
                  title: "confirm-me",
                  content: ({ confirm }) => (
                    <button type="button" onClick={() => confirm()}>
                      yes
                    </button>
                  ),
                })
                .result.then((value) => settlements.push(value));
            }}
          >
            open confirm
          </button>
          <button
            type="button"
            onClick={() => {
              void modals
                .open({
                  title: "cancel-me",
                  content: ({ cancel }) => (
                    <button type="button" onClick={() => cancel()}>
                      no
                    </button>
                  ),
                })
                .result.then((value) => settlements.push(value));
            }}
          >
            open cancel
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
      screen.getByRole("button", { name: "open confirm" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "yes" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "open cancel" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "no" }).click();
    });
    expect(settlements).toEqual(["confirmed", "cancelled"]);
  });

  it("renders alert-dialog entries with alertdialog semantics", async () => {
    render(
      <Host>
        <OpenButton title="danger" surface="alert-dialog" />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open danger" }).click();
    });
    expect(screen.getByRole("alertdialog", { name: "danger" })).toBeVisible();
  });

  it("rejects invalid ids and cross-scope close without mutating the other stack", async () => {
    function Outer() {
      const modals = useModalManager();
      return (
        <button
          type="button"
          onClick={() => {
            void modals.open({ title: "outer", content: "outer body" });
          }}
        >
          open outer
        </button>
      );
    }

    function InnerCloseOuter() {
      const modals = useModalManager();
      return (
        <button
          type="button"
          onClick={() => {
            void modals.close("missing-id").catch(() => {
              document.getElementById("inner-error")!.textContent = "rejected";
            });
          }}
        >
          close missing
        </button>
      );
    }

    render(
      <Host>
        <Outer />
        <div id="inner-error" />
        <ModalManagerProvider>
          <ModalManager />
          <InnerCloseOuter />
        </ModalManagerProvider>
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open outer" }).click();
    });
    await act(async () => {
      screen
        .getByRole("button", { name: "close missing", hidden: true })
        .click();
    });

    expect(screen.getByRole("dialog", { name: "outer" })).toBeVisible();
    expect(document.getElementById("inner-error")).toHaveTextContent(
      "rejected"
    );
  });

  it("ignores duplicate settlement", async () => {
    const settlements: OverlaySettlement[] = [];
    function Capture() {
      const modals = useModalManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = modals.open({
              title: "once",
              content: ({ confirm, cancel }) => (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      confirm();
                      cancel();
                    }}
                  >
                    settle twice
                  </button>
                </>
              ),
            });
            void handle.result.then((value) => settlements.push(value));
          }}
        >
          open once
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open once" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "settle twice" }).click();
    });
    expect(settlements).toEqual(["confirmed"]);
  });

  it("settles remaining entries as dismissed on provider teardown", async () => {
    const settlements: OverlaySettlement[] = [];
    function App() {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setMounted(false)}>
            unmount
          </button>
          {mounted ? (
            <Host>
              <OpenAndRecord settlements={settlements} />
            </Host>
          ) : null}
        </>
      );
    }

    function OpenAndRecord({
      settlements: bucket,
    }: {
      settlements: OverlaySettlement[];
    }) {
      const modals = useModalManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = modals.open({
              title: "lingering",
              content: "still open",
            });
            void handle.result.then((value) => bucket.push(value));
          }}
        >
          open lingering
        </button>
      );
    }

    render(<App />);
    await act(async () => {
      screen.getByRole("button", { name: "open lingering" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "unmount", hidden: true }).click();
    });
    expect(settlements).toEqual(["dismissed"]);
  });

  it("does not open on the server and warns for pre-hydration operations", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    function Opener() {
      const modals = useModalManager();
      const handle = modals.open({
        title: "ssr",
        content: "should not render",
      });
      return <span>{handle.id || "none"}</span>;
    }

    const html = renderToString(
      <Host>
        <Opener />
      </Host>
    );
    expect(html).not.toContain("should not render");
    expect(html).not.toContain('role="dialog"');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("overlay layer registry", () => {
  it("suspends a lower layer when a modal becomes foreground and resumes on close", async () => {
    render(
      <Host>
        <LayerProbe id="sheet-1" kind="sheet" />
        <OpenButton title="modal" />
      </Host>
    );

    expect(screen.getByTestId("sheet-1-status")).toHaveTextContent("active");

    await act(async () => {
      screen.getByRole("button", { name: "open modal" }).click();
    });
    expect(screen.getByTestId("sheet-1-status")).toHaveTextContent("suspended");

    await act(async () => {
      screen.getByRole("button", { name: "dismiss modal" }).click();
    });
    expect(screen.getByTestId("sheet-1-status")).toHaveTextContent("active");
  });

  it("lets a blocking loading layer suspend the modal stack without settling it", async () => {
    function Suspender() {
      const overlay = useOverlayLayer();
      const [registered, setRegistered] = useState(false);
      return (
        <button
          type="button"
          onClick={() => {
            if (!registered) {
              overlay.registerLayer({
                id: "loading-1",
                kind: "loading",
                getRestoreTarget: () => null,
                onSuspend: () => {},
                onResume: () => {},
              });
              setRegistered(true);
            }
            overlay.setForeground("loading-1");
          }}
        >
          block
        </button>
      );
    }

    render(
      <Host>
        <Suspender />
        <OpenButton title="buried" />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open buried" }).click();
    });
    const dialog = screen.getByRole("dialog", { name: "buried" });
    await act(async () => {
      screen.getByRole("button", { name: "block", hidden: true }).click();
    });
    expect(dialog).toBeInTheDocument();
    expect(
      dialog.hasAttribute("inert") ||
        dialog.getAttribute("aria-hidden") === "true"
    ).toBe(true);

    await act(async () => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(screen.getByRole("dialog", { name: "buried" })).toBeInTheDocument();
  });

  it("unregisters layers on teardown without leaking listeners", async () => {
    const overlay = {
      suspends: 0,
      resumes: 0,
    };
    function Probe() {
      const api = useOverlayLayer();
      useEffect(() => {
        return api.registerLayer({
          id: "temp",
          kind: "sheet",
          getRestoreTarget: () => null,
          onSuspend: () => {
            overlay.suspends += 1;
          },
          onResume: () => {
            overlay.resumes += 1;
          },
        });
      }, [api]);
      return null;
    }

    function App() {
      const [show, setShow] = useState(true);
      return (
        <OverlayLayerProvider>
          {show ? <Probe /> : null}
          <button type="button" onClick={() => setShow(false)}>
            drop
          </button>
        </OverlayLayerProvider>
      );
    }

    render(<App />);
    await act(async () => {
      screen.getByRole("button", { name: "drop" }).click();
    });
    expect(overlay.suspends).toBe(0);
    expect(overlay.resumes).toBe(0);
  });
});
