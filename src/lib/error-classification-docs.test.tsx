import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("error-classification")!;
const complete = getCompleteDoc("error-classification");

describe("error-classification docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/error-classification")
    ).toBeInTheDocument();
    expect(screen.getByText("classify-error.ts")).toBeInTheDocument();
    expect(screen.getByText("error.tsx")).toBeInTheDocument();
    expect(screen.getByText("global-error.tsx")).toBeInTheDocument();
    expect(
      screen.getByText("classifyError(error, context?)")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Primary recovery is retry\(\)/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
