import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("draft-autosave")!;
const complete = getCompleteDoc("draft-autosave");

describe("draft-autosave docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/draft-autosave")
    ).toBeInTheDocument();
    expect(screen.getByText("save-flush.tsx")).toBeInTheDocument();
    expect(screen.getByText("namespace.tsx")).toBeInTheDocument();
    expect(screen.getByText("conflict.tsx")).toBeInTheDocument();
    expect(screen.getByText("useDraftAutosave(options)")).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
