import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("modal-manager")!;
const complete = getCompleteDoc("modal-manager");

describe("modal-manager docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/modal-manager")
    ).toBeInTheDocument();
    expect(screen.getByText("stack.tsx")).toBeInTheDocument();
    expect(screen.getByText("replace.tsx")).toBeInTheDocument();
    expect(screen.getByText("alert-dialog.tsx")).toBeInTheDocument();
    expect(screen.getByText("overlay-layer.tsx")).toBeInTheDocument();
    expect(screen.getByText("useModalManager()")).toBeInTheDocument();
    expect(
      screen.getByText(/OverlayLayerProvider \/ useOverlayLayer()/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
