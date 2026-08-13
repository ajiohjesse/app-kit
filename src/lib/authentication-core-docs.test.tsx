import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("authentication-core")!;
const complete = getCompleteDoc("authentication-core");

describe("authentication-core docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/authentication-core")
    ).toBeInTheDocument();
    expect(screen.getByText("provider.tsx")).toBeInTheDocument();
    expect(screen.getByText("spa-adapter.ts")).toBeInTheDocument();
    expect(screen.getByText("seed.tsx")).toBeInTheDocument();
    expect(screen.getByText("failure.tsx")).toBeInTheDocument();
    expect(screen.getByText("token-exchange.ts")).toBeInTheDocument();
    expect(screen.getByText("cookie-session.ts")).toBeInTheDocument();
    expect(
      screen.getByText("authentication-core.server.ts")
    ).toBeInTheDocument();
    expect(
      screen.getByText("AuthProvider / useAuth() / useSession()")
    ).toBeInTheDocument();
    expect(screen.getByText(/A session seed is UX-only/)).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
