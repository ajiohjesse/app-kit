import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("pending-auth-action")!;
const complete = getCompleteDoc("pending-auth-action");

describe("pending-auth-action docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/pending-auth-action")
    ).toBeInTheDocument();
    expect(screen.getByText("register-intent.tsx")).toBeInTheDocument();
    expect(screen.getByText("resume.tsx")).toBeInTheDocument();
    expect(screen.getByText("fail-closed.tsx")).toBeInTheDocument();
    expect(
      screen.getByText("PendingAuthActionProvider / usePendingAuthAction()")
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
