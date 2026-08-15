import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useState, type ReactNode } from "react";
import type { OverlaySettlement } from "../../infra/modal-manager";
import {
  ModalManager,
  ModalManagerProvider,
  OverlayLayerProvider,
  useModalManager,
} from "../../infra/modal-manager-provider";
import {
  SheetManager,
  SheetManagerProvider,
  useSheetManager,
  type SheetSettlement,
} from "../../infra/sheet-manager";

function Host({ children }: { children?: ReactNode }) {
  return (
    <OverlayLayerProvider>
      <ModalManagerProvider>
        <ModalManager />
        <SheetManagerProvider>
          <SheetManager />
          {children}
        </SheetManagerProvider>
      </ModalManagerProvider>
    </OverlayLayerProvider>
  );
}

describe("SheetSettlement", () => {
  it("is the distinct submitted | cancelled | dismissed union", () => {
    const owned: SheetSettlement[] = ["submitted", "cancelled", "dismissed"];
    const overlay: OverlaySettlement[] = [
      "confirmed",
      "cancelled",
      "dismissed",
    ];
    expect(owned).toEqual(["submitted", "cancelled", "dismissed"]);
    expect(owned).not.toEqual(overlay);
  });
});

describe("sheet stack", () => {
  it("opens a LIFO sheet and settles close as dismissed", async () => {
    const settlements: SheetSettlement[] = [];
    function Capture() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = sheets.open({
              title: "Filters",
              content: ({ close }) => (
                <button type="button" onClick={() => close()}>
                  dismiss filters
                </button>
              ),
            });
            void handle.result.then((value) => settlements.push(value));
          }}
        >
          open filters
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open filters" }).click();
    });
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    expect(
      screen
        .getByRole("dialog", { name: "Filters" })
        .closest("[data-slot]")
        ?.getAttribute("data-slot") === "sheet-content" ||
        screen
          .getByRole("dialog", { name: "Filters" })
          .getAttribute("data-slot") === "sheet-content"
    ).toBe(true);

    await act(async () => {
      screen.getByRole("button", { name: "dismiss filters" }).click();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(settlements).toEqual(["dismissed"]);
  });

  it("keeps one sheet by default and only stacks when nested is opted in", async () => {
    function Capture() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            sheets.open({
              title: "first",
              content: "first body",
            });
            sheets.open({
              title: "second",
              content: "second body",
            });
            sheets.open({
              title: "nested",
              nested: true,
              content: "nested body",
            });
          }}
        >
          run stack
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run stack" }).click();
    });

    expect(
      screen.queryByRole("heading", { name: "first", hidden: true })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "second", hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "nested" })).toBeVisible();
  });

  it("replace keeps the stack slot and settles the replaced entry as dismissed", async () => {
    const settlements: SheetSettlement[] = [];
    function Capture() {
      const sheets = useSheetManager();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const first = sheets.open({
                title: "one",
                content: "one body",
              });
              void first.result.then((value) => settlements.push(value));
              const replaced = sheets.replace(first.id, {
                title: "one-b",
                content: "one-b body",
              });
              document.getElementById("replaced-id")!.textContent =
                replaced.id === first.id ? "same" : "new";
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

    expect(screen.getByRole("dialog", { name: "one-b" })).toBeInTheDocument();
    expect(document.getElementById("replaced-id")).toHaveTextContent("same");
    expect(
      screen.queryByRole("heading", { name: "one", hidden: true })
    ).not.toBeInTheDocument();
    expect(settlements).toEqual(["dismissed"]);
  });

  it("settles submit and cancel from the content context", async () => {
    const settlements: SheetSettlement[] = [];
    function Capture() {
      const sheets = useSheetManager();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void sheets
                .open({
                  title: "submit-me",
                  content: ({ submit }) => (
                    <button type="button" onClick={() => submit()}>
                      save
                    </button>
                  ),
                })
                .result.then((value) => settlements.push(value));
            }}
          >
            open submit
          </button>
          <button
            type="button"
            onClick={() => {
              void sheets
                .open({
                  title: "cancel-me",
                  content: ({ cancel }) => (
                    <button type="button" onClick={() => cancel()}>
                      abort
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
      screen.getByRole("button", { name: "open submit" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "save" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "open cancel" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "abort" }).click();
    });
    expect(settlements).toEqual(["submitted", "cancelled"]);
  });

  it("renders the requested side on the sheet surface", async () => {
    function Capture() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            sheets.open({
              title: "Left panel",
              side: "left",
              content: "left body",
            });
          }}
        >
          open left
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open left" }).click();
    });
    expect(screen.getByRole("dialog", { name: "Left panel" })).toHaveAttribute(
      "data-side",
      "left"
    );
  });

  it("pending disables configured dismissal and exposes busy state", async () => {
    function Capture() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = sheets.open({
              title: "Saving",
              pending: true,
              content: ({ setPending }) => (
                <button type="button" onClick={() => setPending(false)}>
                  done
                </button>
              ),
            });
            document.getElementById("pending-id")!.textContent = handle.id;
          }}
        >
          open pending
        </button>
      );
    }

    render(
      <Host>
        <Capture />
        <span id="pending-id" />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open pending" }).click();
    });
    const sheet = screen.getByRole("dialog", { name: "Saving" });
    expect(sheet).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      sheet.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(screen.getByRole("dialog", { name: "Saving" })).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "done" }).click();
    });
    expect(screen.getByRole("dialog", { name: "Saving" })).not.toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("rejects invalid ids and cross-scope close without mutating the other stack", async () => {
    function Outer() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            void sheets.open({ title: "outer", content: "outer body" });
          }}
        >
          open outer
        </button>
      );
    }

    function InnerCloseMissing() {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            void sheets.close("missing-id").catch(() => {
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
        <SheetManagerProvider>
          <SheetManager />
          <InnerCloseMissing />
        </SheetManagerProvider>
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

  it("settles remaining entries as dismissed on provider teardown", async () => {
    const settlements: SheetSettlement[] = [];
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
      settlements: SheetSettlement[];
    }) {
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            const handle = sheets.open({
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
      const sheets = useSheetManager();
      const handle = sheets.open({
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

describe("stack isolation", () => {
  it("never closes or mutates modal entries", async () => {
    const modalSettlements: OverlaySettlement[] = [];
    const sheetSettlements: SheetSettlement[] = [];

    function Capture() {
      const modals = useModalManager();
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            const modal = modals.open({
              title: "Account",
              content: "account body",
            });
            void modal.result.then((value) => modalSettlements.push(value));
            const sheet = sheets.open({
              title: "Filters",
              content: ({ close }) => (
                <button type="button" onClick={() => close()}>
                  dismiss filters
                </button>
              ),
            });
            void sheet.result.then((value) => sheetSettlements.push(value));
            void sheets.closeAll();
          }}
        >
          compose
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "compose" }).click();
    });

    expect(
      screen.getByRole("heading", { name: "Account", hidden: true })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Filters" })
    ).not.toBeInTheDocument();
    expect(modalSettlements).toEqual([]);
    expect(sheetSettlements).toEqual(["dismissed"]);
  });

  it("suspends an open modal when a sheet becomes foreground without settling it", async () => {
    function Capture() {
      const modals = useModalManager();
      const sheets = useSheetManager();
      return (
        <button
          type="button"
          onClick={() => {
            void modals.open({
              title: "Account",
              content: "account body",
            });
            void sheets.open({
              title: "Filters",
              content: "filters body",
            });
          }}
        >
          open both
        </button>
      );
    }

    render(
      <Host>
        <Capture />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "open both" }).click();
    });

    const sheet = screen.getByRole("dialog", {
      name: "Filters",
      hidden: true,
    });
    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    expect(sheet).not.toHaveAttribute("inert");
    const modal = screen
      .getByRole("heading", { name: "Account", hidden: true })
      .closest('[role="dialog"]');
    expect(modal).toBeInTheDocument();
    expect(
      modal?.hasAttribute("inert") ||
        modal?.getAttribute("aria-hidden") === "true" ||
        modal?.hasAttribute("data-base-ui-inert")
    ).toBe(true);
  });
});
