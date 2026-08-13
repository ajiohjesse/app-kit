import { render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  createFlagSnapshot,
  identityKeyFromContext,
  type FlagAdapter,
  type FlagDiagnostic,
  type FlagSchema,
  type FlagSnapshot,
} from "../../infra/feature-flags";
import {
  FeatureFlagProvider,
  ServerOnlyFlagError,
  useFlag,
  useFlags,
} from "../../infra/feature-flags-provider";

const schema = {
  checkout: {
    type: "boolean",
    default: false,
    exposure: "public",
  },
  theme: {
    type: "variant",
    variants: ["light", "dark"],
    default: "light",
    exposure: "public",
  },
  internalBilling: {
    type: "boolean",
    default: false,
    exposure: "server-only",
  },
} as const satisfies FlagSchema;

function FlagHost({
  children,
  snapshot,
  adapter,
  evaluationContext,
  overrides,
  sync,
  onDiagnostic,
}: {
  children: ReactNode;
  snapshot?: ReturnType<typeof createFlagSnapshot>["snapshot"];
  adapter?: FlagAdapter;
  evaluationContext?: { userId?: string };
  overrides?: Record<string, boolean | string>;
  sync?: {
    subscribe: (listener: (snapshot: FlagSnapshot) => void) => () => void;
    publish?: (snapshot: FlagSnapshot) => void;
  };
  onDiagnostic?: (diagnostic: FlagDiagnostic) => void;
}) {
  return (
    <FeatureFlagProvider
      schema={schema}
      schemaVersion="flags-v1"
      snapshot={snapshot}
      adapter={adapter}
      evaluationContext={evaluationContext}
      overrides={overrides}
      sync={sync}
      onDiagnostic={onDiagnostic}
    >
      {children}
    </FeatureFlagProvider>
  );
}

describe("createFlagSnapshot", () => {
  it("fills schema defaults when values are missing", () => {
    const { snapshot, diagnostics } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: {},
    });

    expect(snapshot.values).toEqual({ checkout: false, theme: "light" });
    expect(snapshot.values).not.toHaveProperty("internalBilling");
    expect(diagnostics.map((item) => item.reason)).toEqual([
      "missing",
      "missing",
    ]);
    expect(
      diagnostics.every((item) => item.snapshotVersion === "flags-v1")
    ).toBe(true);
  });

  it("uses schema defaults for wrong types and disallowed variants", () => {
    const { snapshot, diagnostics } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: "yes", theme: "sepia" },
    });

    expect(snapshot.values).toEqual({ checkout: false, theme: "light" });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        key: "checkout",
        reason: "invalid-type",
        expected: { type: "boolean" },
      }),
      expect.objectContaining({
        key: "theme",
        reason: "disallowed-variant",
        expected: { type: "variant", variants: ["light", "dark"] },
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(/yes|sepia/);
  });

  it("keeps valid public values and never serializes server-only flags by default", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: {
        checkout: true,
        theme: "dark",
        internalBilling: true,
      },
    });

    expect(snapshot).toEqual({
      schemaVersion: "flags-v1",
      values: { checkout: true, theme: "dark" },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/internalBilling/);
  });

  it("includes server-only flags only when explicitly requested", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { internalBilling: true },
      includeServerOnly: true,
    });

    expect(snapshot.values.internalBilling).toBe(true);
    expect(snapshot.values.checkout).toBe(false);
  });
});

describe("FeatureFlagProvider", () => {
  it("hydrates from a valid bootstrap snapshot on the first render", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: true, theme: "dark" },
    });
    const first: Array<boolean | string> = [];

    function Probe() {
      first.push(useFlag("checkout"), useFlag("theme"));
      return (
        <p>
          checkout:{String(useFlag("checkout"))} theme:{useFlag("theme")}
        </p>
      );
    }

    render(
      <FlagHost snapshot={snapshot}>
        <Probe />
      </FlagHost>
    );

    expect(first.slice(0, 2)).toEqual([true, "dark"]);
    expect(screen.getByText("checkout:true theme:dark")).toBeInTheDocument();
  });

  it("rejects malformed or incompatible snapshots and uses schema defaults", () => {
    const diagnostics: FlagDiagnostic[] = [];

    function Probe() {
      return <p>{String(useFlag("checkout"))}</p>;
    }

    const { rerender } = render(
      <FlagHost
        snapshot={{ schemaVersion: "other", values: { checkout: true } }}
        onDiagnostic={(diagnostic) => diagnostics.push(diagnostic)}
      >
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("false")).toBeInTheDocument();
    expect(
      diagnostics.some((item) => item.reason === "incompatible-snapshot")
    ).toBe(true);

    rerender(
      <FlagHost
        snapshot={null as never}
        onDiagnostic={(diagnostic) => diagnostics.push(diagnostic)}
      >
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("rejects client reads of server-only flags", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { internalBilling: true },
      includeServerOnly: true,
    });

    function Probe() {
      useFlag("internalBilling");
      return null;
    }

    expect(() =>
      render(
        <FlagHost snapshot={snapshot}>
          <Probe />
        </FlagHost>
      )
    ).toThrow(ServerOnlyFlagError);
  });

  it("keeps the last valid snapshot while refresh is pending or the adapter fails", async () => {
    let rejectRefresh: ((error: Error) => void) | undefined;
    const adapter: FlagAdapter = {
      evaluate: () =>
        new Promise((_, reject) => {
          rejectRefresh = reject;
        }),
    };
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: true, theme: "dark" },
    });

    function Probe() {
      const { refresh, refreshing } = useFlags();
      useEffect(() => {
        void refresh();
      }, [refresh]);
      return (
        <p>
          checkout:{String(useFlag("checkout"))} theme:{useFlag("theme")}{" "}
          {refreshing ? "pending" : "idle"}
        </p>
      );
    }

    render(
      <FlagHost snapshot={snapshot} adapter={adapter}>
        <Probe />
      </FlagHost>
    );

    expect(await screen.findByText(/pending/)).toBeInTheDocument();
    expect(screen.getByText(/checkout:true theme:dark/)).toBeInTheDocument();

    rejectRefresh?.(new Error("unavailable"));

    expect(await screen.findByText(/idle/)).toBeInTheDocument();
    expect(screen.getByText(/checkout:true theme:dark/)).toBeInTheDocument();
  });

  it("replaces flag values atomically from a new snapshot", async () => {
    let resolveRefresh: ((value: Record<string, unknown>) => void) | undefined;
    const adapter: FlagAdapter = {
      evaluate: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    };
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: true, theme: "dark" },
    });

    function Probe() {
      const { refresh } = useFlags();
      useEffect(() => {
        void refresh();
      }, [refresh]);
      return (
        <p>
          checkout:{String(useFlag("checkout"))} theme:{useFlag("theme")}
        </p>
      );
    }

    render(
      <FlagHost snapshot={snapshot} adapter={adapter}>
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("checkout:true theme:dark")).toBeInTheDocument();
    resolveRefresh?.({ checkout: false });
    expect(
      await screen.findByText("checkout:false theme:light")
    ).toBeInTheDocument();
  });

  it("does not keep a snapshot after the evaluation identity changes", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: true },
      identityKey: identityKeyFromContext({ userId: "user-a" }),
    });

    function Probe() {
      return <p>{String(useFlag("checkout"))}</p>;
    }

    const { rerender } = render(
      <FlagHost snapshot={snapshot} evaluationContext={{ userId: "user-a" }}>
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("true")).toBeInTheDocument();

    rerender(
      <FlagHost snapshot={snapshot} evaluationContext={{ userId: "user-b" }}>
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("applies explicit overrides without reading adapter values for those keys", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: false, theme: "light" },
    });

    function Probe() {
      return (
        <p>
          {String(useFlag("checkout"))} {useFlag("theme")}
        </p>
      );
    }

    render(
      <FlagHost
        snapshot={snapshot}
        overrides={{ checkout: true, theme: "dark" }}
      >
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("true dark")).toBeInTheDocument();
  });

  it("uses schema defaults when an override is the wrong type or variant", () => {
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: true, theme: "dark" },
    });

    function Probe() {
      return (
        <p>
          {String(useFlag("checkout"))} {useFlag("theme")}
        </p>
      );
    }

    render(
      <FlagHost
        snapshot={snapshot}
        overrides={{ checkout: "yes" as unknown as boolean, theme: "sepia" }}
      >
        <Probe />
      </FlagHost>
    );

    expect(screen.getByText("false light")).toBeInTheDocument();
  });

  it("cancels in-flight refresh on unmount so a stale snapshot cannot commit", async () => {
    let resolveRefresh: ((value: Record<string, unknown>) => void) | undefined;
    const adapter: FlagAdapter = {
      evaluate: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    };
    const { snapshot } = createFlagSnapshot(schema, {
      schemaVersion: "flags-v1",
      values: { checkout: false },
    });
    const seen: Array<boolean | string> = [];

    function Probe() {
      const { refresh } = useFlags();
      seen.push(useFlag("checkout"));
      useEffect(() => {
        void refresh();
      }, [refresh]);
      return <p>{String(useFlag("checkout"))}</p>;
    }

    const { unmount } = render(
      <FlagHost snapshot={snapshot} adapter={adapter}>
        <Probe />
      </FlagHost>
    );

    unmount();
    resolveRefresh?.({ checkout: true });
    await Promise.resolve();

    expect(seen.every((value) => value === false)).toBe(true);
  });
});
