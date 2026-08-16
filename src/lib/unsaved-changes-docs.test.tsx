import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("unsaved-changes")!;
const complete = getCompleteDoc("unsaved-changes");

describe("unsaved-changes docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/unsaved-changes")
    ).toBeInTheDocument();
    expect(screen.getByText("dirty-flag.tsx")).toBeInTheDocument();
    expect(screen.getByText("confirm-leave.tsx")).toBeInTheDocument();
    expect(screen.getByText("one-shot-retry.tsx")).toBeInTheDocument();
    expect(screen.getByText("next-limitation.tsx")).toBeInTheDocument();
    expect(screen.getByText("draft-dirty-source.tsx")).toBeInTheDocument();
    expect(screen.getByText("spa-router.tsx")).toBeInTheDocument();
    expect(screen.getByText("next-app-router.tsx")).toBeInTheDocument();
    expect(screen.getByText("useUnsavedChanges(options)")).toBeInTheDocument();
    expect(
      screen.getByText(/in-app navigation blocking is best-effort/i)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
