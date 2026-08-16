import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("auth-guard")!;
const complete = getCompleteDoc("auth-guard");

describe("auth-guard docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/auth-guard")
    ).toBeInTheDocument();
    expect(screen.getByText("redirect-without-resume.tsx")).toBeInTheDocument();
    expect(screen.getByText("redirect-and-resume.tsx")).toBeInTheDocument();
    expect(screen.getByText("inline.tsx")).toBeInTheDocument();
    expect(screen.getByText("guarded-action.tsx")).toBeInTheDocument();
    expect(screen.getByText("fail-closed-resume.tsx")).toBeInTheDocument();
    expect(screen.getByText("seed-ux-only.tsx")).toBeInTheDocument();
    expect(screen.getByText("spa.tsx")).toBeInTheDocument();
    expect(screen.getByText("protected-settings.tsx")).toBeInTheDocument();
    expect(screen.getByText("UnauthenticatedPolicy")).toBeInTheDocument();
    expect(
      screen.getByText("withAuthGuard(action, options)")
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
