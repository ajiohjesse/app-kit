import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("optimistic-mutation")!;
const complete = getCompleteDoc("optimistic-mutation");

describe("optimistic-mutation docs", () => {
  it("renders a complete item without placeholder chrome", async () => {
    render(await DocPageView({ doc, complete }));

    expect(screen.queryByText("placeholder")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/implementation reserved for the next pass/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("// API surface to be finalized")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Open questions")).not.toBeInTheDocument();

    expect(
      screen.getByText("bunx shadcn@latest add @app-kit/optimistic-mutation")
    ).toBeInTheDocument();
    expect(screen.getByText("update.tsx")).toBeInTheDocument();
    expect(screen.getByText("rollback.tsx")).toBeInTheDocument();
    expect(screen.getByText("conflict-policy.tsx")).toBeInTheDocument();
    expect(screen.getByText("action-runner.tsx")).toBeInTheDocument();
    expect(screen.getByText("server-action.ts")).toBeInTheDocument();
    expect(screen.getByText("useOptimistic.tsx")).toBeInTheDocument();
    expect(
      screen.getByText("createOptimisticMutation(config)")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/TanStack Query is a required peer for this item only/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
