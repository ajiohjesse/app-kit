import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("action-runner")!;
const complete = getCompleteDoc("action-runner");

describe("action-runner docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/action-runner")
    ).toBeInTheDocument();
    expect(screen.getByText("basic-run.tsx")).toBeInTheDocument();
    expect(screen.getByText("confirm-blocking.tsx")).toBeInTheDocument();
    expect(screen.getByText("server-action.tsx")).toBeInTheDocument();
    expect(screen.getByText("useActionRunner()")).toBeInTheDocument();
    expect(
      screen.getByText(/confirm-dialog and loading-overlay are optional/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
