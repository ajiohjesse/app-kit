import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("sheet-manager")!;
const complete = getCompleteDoc("sheet-manager");

describe("sheet-manager docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/sheet-manager")
    ).toBeInTheDocument();
    expect(screen.getByText("open.tsx")).toBeInTheDocument();
    expect(screen.getByText("replace.tsx")).toBeInTheDocument();
    expect(screen.getByText("nested.tsx")).toBeInTheDocument();
    expect(screen.getByText("compose-modal.tsx")).toBeInTheDocument();
    expect(screen.getByText("useSheetManager()")).toBeInTheDocument();
    expect(
      screen.getByText(/Sheet operations never close or mutate modal entries/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
