import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("alert-prompt-dialog")!;
const complete = getCompleteDoc("alert-prompt-dialog");

describe("alert-prompt-dialog docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/alert-prompt-dialog")
    ).toBeInTheDocument();
    expect(screen.getByText("alert.tsx")).toBeInTheDocument();
    expect(screen.getByText("prompt.tsx")).toBeInTheDocument();
    expect(screen.getByText("validate.tsx")).toBeInTheDocument();
    expect(screen.getByText("useAlertPromptDialog()")).toBeInTheDocument();
    expect(
      screen.getByText(/Alert opens a modal-manager alert-dialog/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
