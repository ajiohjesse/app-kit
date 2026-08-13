import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("feature-flags")!;
const complete = getCompleteDoc("feature-flags");

describe("feature-flags docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/feature-flags")
    ).toBeInTheDocument();
    expect(screen.getByText("flag-schema.ts")).toBeInTheDocument();
    expect(screen.getByText("provider.tsx")).toBeInTheDocument();
    expect(screen.getByText("refresh.tsx")).toBeInTheDocument();
    expect(screen.getByText("feature-flags.server.ts")).toBeInTheDocument();
    expect(
      screen.getByText("createFlagSnapshot(schema, input)")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Server helpers live in @lib\/feature-flags.server.ts/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
