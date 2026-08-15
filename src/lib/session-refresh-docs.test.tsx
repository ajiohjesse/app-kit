import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("session-refresh")!;
const complete = getCompleteDoc("session-refresh");

describe("session-refresh docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/session-refresh")
    ).toBeInTheDocument();
    expect(screen.getByText("coordinator.tsx")).toBeInTheDocument();
    expect(screen.getByText("replay-policy.tsx")).toBeInTheDocument();
    expect(screen.getByText("401-recovery.tsx")).toBeInTheDocument();
    expect(
      screen.getByText("SessionRefreshProvider / useSessionRefresh()")
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
