import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("idle-timeout")!;
const complete = getCompleteDoc("idle-timeout");

describe("idle-timeout docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/idle-timeout")
    ).toBeInTheDocument();
    expect(screen.getByText("provider.tsx")).toBeInTheDocument();
    expect(screen.getByText("warning-copy.tsx")).toBeInTheDocument();
    expect(screen.getByText("continue-vs-refresh.tsx")).toBeInTheDocument();
    expect(screen.getByText("cross-tab-sign-out.tsx")).toBeInTheDocument();
    expect(screen.getByText("useIdleTimeout()")).toBeInTheDocument();
    expect(
      screen.getByText(/Continue extends the idle timer only/i)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
