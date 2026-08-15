import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("command-palette")!;
const complete = getCompleteDoc("command-palette");

describe("command-palette docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/command-palette")
    ).toBeInTheDocument();
    expect(screen.getByText("register.tsx")).toBeInTheDocument();
    expect(screen.getByText("global-host.tsx")).toBeInTheDocument();
    expect(screen.getByText("local-embed.tsx")).toBeInTheDocument();
    expect(screen.getByText("error-path.tsx")).toBeInTheDocument();
    expect(screen.getByText("useCommandPalette()")).toBeInTheDocument();
    expect(
      screen.getByText("Destructive commands", { exact: true })
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  }, 30_000);
});
