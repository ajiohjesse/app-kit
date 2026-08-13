import { render, screen } from "@testing-library/react";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
import { getDoc } from "@/lib/docs";

const doc = getDoc("offline-banner")!;
const complete = getCompleteDoc("offline-banner");

describe("offline-banner docs", () => {
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
      screen.getByText("bunx shadcn@latest add @app-kit/offline-banner")
    ).toBeInTheDocument();
    expect(screen.getByText("provider.tsx")).toBeInTheDocument();
    expect(screen.getByText("banner.tsx", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("probe.tsx")).toBeInTheDocument();
    expect(screen.getByText("useConnectivity()")).toBeInTheDocument();
    expect(
      screen.getByText(/OfflineBanner is status chrome/)
    ).toBeInTheDocument();
    expect(
      complete?.examples.every((example) => !example.code.includes("@/infra/"))
    ).toBe(true);
  });
});
