import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("loading-overlay")!;
const complete = getCompleteDoc("loading-overlay");

describe("loading-overlay docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/loading-overlay")
    ).toBeInTheDocument();
    expect(screen.getByText("global.tsx")).toBeInTheDocument();
    expect(screen.getByText("scoped.tsx")).toBeInTheDocument();
    expect(screen.getByText("token-lifecycle.tsx")).toBeInTheDocument();
    expect(screen.getByText("non-blocking.tsx")).toBeInTheDocument();
    expect(screen.getByText("useLoadingOverlay()")).toBeInTheDocument();
    expect(
      screen.getByText(/Blocking overlays register with the Overlay Layer/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
