import { render, screen } from "@testing-library/react";
import { DocPageView } from "./doc-page";
import { docs } from "@/lib/docs";
import type { CompleteDocSlots } from "@/lib/complete-docs";

const doc = docs[0];

const complete: CompleteDocSlots = {
  preview: <div>Live preview</div>,
  examples: [
    {
      label: "usage.tsx",
      language: "tsx",
      code: "export function Demo() {\n  return <Button />;\n}",
    },
  ],
  api: <div>classifyError(error)</div>,
  spaRecipes: [
    {
      label: "spa.tsx",
      language: "tsx",
      code: "createRoot(el).render(<App />)",
    },
  ],
  nextRecipes: [
    {
      label: "error.tsx",
      language: "tsx",
      code: "export default function ErrorPage({ retry }) {\n  return <button onClick={() => retry()} />;\n}",
    },
  ],
  limitations: ["Next App Router recipes are documentation-only."],
};

describe("DocPageView", () => {
  it("keeps placeholder chrome for unimplemented slugs", async () => {
    render(await DocPageView({ doc }));

    expect(screen.getByText("placeholder")).toBeInTheDocument();
    expect(
      screen.getByText(/implementation reserved for the next pass/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("// API surface to be finalized")
    ).toBeInTheDocument();
    expect(screen.getByText("Open questions")).toBeInTheDocument();
    expect(screen.getByText(doc.questions[0])).toBeInTheDocument();
    expect(screen.queryByText("Limitations")).not.toBeInTheDocument();
  });

  it("renders complete-item slots without placeholder chrome", async () => {
    render(await DocPageView({ doc, complete }));

    expect(screen.queryByText("placeholder")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/implementation reserved for the next pass/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("// API surface to be finalized")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Open questions")).not.toBeInTheDocument();

    expect(screen.getByText("Live preview")).toBeInTheDocument();
    expect(screen.getByText("usage.tsx")).toBeInTheDocument();
    expect(screen.getByText("classifyError(error)")).toBeInTheDocument();
    expect(screen.getByText("SPA")).toBeInTheDocument();
    expect(screen.getByText("spa.tsx")).toBeInTheDocument();
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("error.tsx")).toBeInTheDocument();
    expect(screen.getByText("Limitations")).toBeInTheDocument();
    expect(
      screen.getByText("Next App Router recipes are documentation-only.")
    ).toBeInTheDocument();
  });
});
