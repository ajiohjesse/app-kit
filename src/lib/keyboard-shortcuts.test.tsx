import { render } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  canonicalizeShortcut,
  formatShortcut,
  registerShortcut,
  ShortcutConflictError,
  ShortcutRegistryProvider,
  useShortcut,
  useShortcutScope,
} from "../../infra/keyboard-shortcuts";

function fireKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

function RegistryHost({
  children,
  platform = "windows",
  onError,
}: {
  children: ReactNode;
  platform?: "mac" | "windows";
  onError?: (error: unknown) => void;
}) {
  return (
    <ShortcutRegistryProvider platform={platform} onError={onError}>
      {children}
    </ShortcutRegistryProvider>
  );
}

describe("canonicalizeShortcut", () => {
  it("normalizes aliases and modifier order to Mod+K on Windows", () => {
    expect(canonicalizeShortcut("ctrl+k", "windows")).toBe("Mod+K");
    expect(canonicalizeShortcut("Control+K", "windows")).toBe("Mod+K");
    expect(canonicalizeShortcut("k+ctrl", "windows")).toBe("Mod+K");
    expect(canonicalizeShortcut("Mod+K", "windows")).toBe("Mod+K");
  });

  it("maps Meta/Cmd to Mod on mac and leaves Ctrl distinct", () => {
    expect(canonicalizeShortcut("Meta+K", "mac")).toBe("Mod+K");
    expect(canonicalizeShortcut("Cmd+K", "mac")).toBe("Mod+K");
    expect(canonicalizeShortcut("Command+K", "mac")).toBe("Mod+K");
    expect(canonicalizeShortcut("Ctrl+K", "mac")).toBe("Ctrl+K");
  });

  it("leaves explicit Meta distinct on Windows", () => {
    expect(canonicalizeShortcut("Meta+K", "windows")).toBe("Meta+K");
    expect(canonicalizeShortcut("Win+K", "windows")).toBe("Meta+K");
  });

  it("orders modifiers as Mod, Ctrl, Meta, Alt, Shift", () => {
    expect(canonicalizeShortcut("Shift+Alt+Mod+K", "windows")).toBe(
      "Mod+Alt+Shift+K"
    );
    expect(canonicalizeShortcut("Shift+Ctrl+K", "mac")).toBe("Ctrl+Shift+K");
  });

  it("rejects sequences", () => {
    expect(() => canonicalizeShortcut("Mod+K G", "windows")).toThrow(
      /single chord/i
    );
    expect(() => canonicalizeShortcut("Mod+K,G", "windows")).toThrow(
      /single chord/i
    );
    expect(() => canonicalizeShortcut("g then t", "windows")).toThrow(
      /single chord/i
    );
  });
});

describe("formatShortcut", () => {
  it("prints platform-aware labels", () => {
    expect(formatShortcut("Mod+K", "mac")).toBe("⌘K");
    expect(formatShortcut("Mod+K", "windows")).toBe("Ctrl+K");
    expect(formatShortcut("Shift+Mod+P", "mac")).toBe("⇧⌘P");
    expect(formatShortcut("Shift+Mod+P", "windows")).toBe("Ctrl+Shift+P");
    expect(formatShortcut("Alt+N", "mac")).toBe("⌥N");
    expect(formatShortcut("Alt+N", "windows")).toBe("Alt+N");
  });
});

describe("registerShortcut", () => {
  it("dispatches a matching chord and unregisters on cleanup", () => {
    const handler = vi.fn();
    let unregister: (() => void) | undefined;

    function Probe() {
      useEffect(() => {
        unregister = registerShortcut({
          shortcut: "Mod+K",
          handler,
        });
      }, []);
      return null;
    }

    const { unmount } = render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].chord).toBe("Mod+K");

    unregister?.();
    fireKey("k", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("replaces only the matching explicit key", () => {
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();

    function Probe() {
      useEffect(() => {
        const stopFirst = registerShortcut({
          id: "open",
          shortcut: "Mod+K",
          handler: first,
        });
        const stopOther = registerShortcut({
          id: "other",
          shortcut: "Mod+P",
          handler: other,
        });
        const stopSecond = registerShortcut({
          id: "open",
          shortcut: "Mod+K",
          handler: second,
        });
        return () => {
          stopFirst();
          stopOther();
          stopSecond();
        };
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    fireKey("p", { ctrlKey: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("keeps the old keyed registration if a replace conflicts", () => {
    const original = vi.fn();
    const replacement = vi.fn();
    const occupant = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({
          id: "open",
          shortcut: "Mod+K",
          handler: original,
        });
        registerShortcut({
          id: "other",
          shortcut: "Mod+P",
          handler: occupant,
        });
        try {
          registerShortcut({
            id: "open",
            shortcut: "Mod+P",
            handler: replacement,
          });
        } catch {
          // replace must not drop the original
        }
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    fireKey("p", { ctrlKey: true });
    expect(original).toHaveBeenCalledTimes(1);
    expect(occupant).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("matches a Space chord from a real key event", () => {
    const handler = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+Space", handler });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey(" ", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].chord).toBe("Mod+Space");
  });

  it("rejects a different-key tie on the same chord", () => {
    const errors: unknown[] = [];

    function Probe() {
      useEffect(() => {
        registerShortcut({
          id: "open",
          shortcut: "Mod+K",
          handler: vi.fn(),
        });
        try {
          registerShortcut({
            id: "other",
            shortcut: "Mod+K",
            handler: vi.fn(),
          });
        } catch (error) {
          errors.push(error);
        }
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    expect(errors[0]).toBeInstanceOf(ShortcutConflictError);
  });

  it("rejects a same-scope same-priority tie with a typed conflict", () => {
    const errors: unknown[] = [];

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler: vi.fn() });
        try {
          registerShortcut({ shortcut: "Mod+K", handler: vi.fn() });
        } catch (error) {
          errors.push(error);
        }
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    expect(errors[0]).toBeInstanceOf(ShortcutConflictError);
    expect(errors[0]).toMatchObject({ chord: "Mod+K", scope: "global" });
  });

  it("does not match an unavailable modifier variant", () => {
    const handler = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Meta+K", handler });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();

    fireKey("k", { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("lets higher priority win over a later registration", () => {
    const low = vi.fn();
    const high = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler: low, priority: 1 });
        registerShortcut({ shortcut: "Mod+K", handler: high, priority: 2 });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    expect(high).toHaveBeenCalledTimes(1);
    expect(low).not.toHaveBeenCalled();
  });
});

describe("shortcut scopes", () => {
  it("isolates an active child scope from parent registrations", () => {
    const globalHandler = vi.fn();
    const editorHandler = vi.fn();

    function Probe() {
      useShortcutScope("editor");
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+S", handler: globalHandler });
        registerShortcut({
          shortcut: "Mod+S",
          scope: "editor",
          handler: editorHandler,
        });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("s", { ctrlKey: true });
    expect(editorHandler).toHaveBeenCalledTimes(1);
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it("lets a composed child shadow only the matching parent chord", () => {
    const save = vi.fn();
    const editorSave = vi.fn();
    const open = vi.fn();

    function Probe() {
      useShortcutScope("editor", { compose: true });
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+S", handler: save });
        registerShortcut({ shortcut: "Mod+K", handler: open });
        registerShortcut({
          shortcut: "Mod+S",
          scope: "editor",
          handler: editorSave,
        });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("s", { ctrlKey: true });
    fireKey("k", { ctrlKey: true });
    expect(editorSave).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("restores parent registrations when a child scope tears down", () => {
    const globalHandler = vi.fn();

    function Child() {
      useShortcutScope("editor");
      return null;
    }

    function Probe({ scoped }: { scoped: boolean }) {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+S", handler: globalHandler });
      }, []);
      return scoped ? <Child /> : null;
    }

    const { rerender } = render(
      <RegistryHost>
        <Probe scoped />
      </RegistryHost>
    );

    fireKey("s", { ctrlKey: true });
    expect(globalHandler).not.toHaveBeenCalled();

    rerender(
      <RegistryHost>
        <Probe scoped={false} />
      </RegistryHost>
    );

    fireKey("s", { ctrlKey: true });
    expect(globalHandler).toHaveBeenCalledTimes(1);
  });
});

describe("input suppression and repeat", () => {
  it("suppresses shortcuts in text inputs unless opted in", () => {
    const blocked = vi.fn();
    const allowed = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler: blocked });
        registerShortcut({
          shortcut: "Mod+P",
          handler: allowed,
          allowInInputs: true,
        });
      }, []);
      return <input aria-label="title" />;
    }

    const { getByLabelText } = render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    const input = getByLabelText("title");
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "p",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(blocked).not.toHaveBeenCalled();
    expect(allowed).toHaveBeenCalledTimes(1);
  });

  it("suppresses shortcuts in contenteditable elements", () => {
    const handler = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler });
      }, []);
      return <div aria-label="draft" contentEditable />;
    }

    const { getByLabelText } = render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    getByLabelText("draft").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores key repeats unless repeat is allow", () => {
    const ignored = vi.fn();
    const allowed = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler: ignored });
        registerShortcut({
          shortcut: "Mod+P",
          handler: allowed,
          repeat: "allow",
        });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true, repeat: true });
    fireKey("p", { ctrlKey: true, repeat: true });
    expect(ignored).not.toHaveBeenCalled();
    expect(allowed).toHaveBeenCalledTimes(1);
  });
});

describe("dispatch policy", () => {
  it("continues after a non-exclusive match", () => {
    const first = vi.fn();
    const second = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({
          shortcut: "Mod+K",
          handler: first,
          exclusive: false,
          priority: 2,
        });
        registerShortcut({
          shortcut: "Mod+K",
          handler: second,
          priority: 1,
        });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("prevents the browser default only when requested", () => {
    const handler = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({
          shortcut: "Mod+K",
          handler,
          preventDefault: true,
        });
        registerShortcut({ shortcut: "Mod+P", handler: vi.fn() });
      }, []);
      return null;
    }

    render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    const prevented = fireKey("k", { ctrlKey: true });
    const preserved = fireKey("p", { ctrlKey: true });
    expect(prevented.defaultPrevented).toBe(true);
    expect(preserved.defaultPrevented).toBe(false);
  });

  it("isolates handler exceptions through onError", () => {
    const onError = vi.fn();
    const later = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({
          shortcut: "Mod+K",
          handler: () => {
            throw new Error("boom");
          },
          exclusive: false,
          priority: 2,
        });
        registerShortcut({
          shortcut: "Mod+K",
          handler: later,
          priority: 1,
        });
      }, []);
      return null;
    }

    render(
      <RegistryHost onError={onError}>
        <Probe />
      </RegistryHost>
    );

    fireKey("k", { ctrlKey: true });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toEqual(new Error("boom"));
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe("useShortcut", () => {
  it("does not emit a typed conflict on Strict Mode remount", () => {
    const handler = vi.fn();

    function Probe() {
      useShortcut({ shortcut: "Mod+K", handler });
      return null;
    }

    expect(() =>
      render(
        <RegistryHost>
          <Probe />
        </RegistryHost>,
        { reactStrictMode: true }
      )
    ).not.toThrow();

    fireKey("k", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("provider teardown", () => {
  it("stops dispatch after unmount", () => {
    const handler = vi.fn();

    function Probe() {
      useEffect(() => {
        registerShortcut({ shortcut: "Mod+K", handler });
      }, []);
      return null;
    }

    const { unmount } = render(
      <RegistryHost>
        <Probe />
      </RegistryHost>
    );

    unmount();
    fireKey("k", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
