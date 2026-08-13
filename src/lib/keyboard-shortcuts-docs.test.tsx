import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("keyboard-shortcuts")!;
const complete = getCompleteDoc("keyboard-shortcuts");

describe("keyboard-shortcuts docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/keyboard-shortcuts")
    ).toBeInTheDocument();
    expect(screen.getByText("register-shortcut.tsx")).toBeInTheDocument();
    expect(screen.getByText("platform-label.tsx")).toBeInTheDocument();
    expect(screen.getByText("conflict.ts")).toBeInTheDocument();
    expect(screen.getByText("useShortcut(registration)")).toBeInTheDocument();
    expect(
      screen.getByText(/Client-only\. Server Components may place/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
