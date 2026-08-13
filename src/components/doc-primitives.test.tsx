import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeBlock, InstallCommand } from "./doc-primitives";
import { docs } from "@/lib/docs";

const doc = docs[0];

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

describe("CodeBlock", () => {
  it("highlights TypeScript tokens and copies the original source", async () => {
    const source = 'const name: string = "app-kit"';
    render(
      await CodeBlock({
        code: source,
        language: "typescript",
        label: "example.ts",
      })
    );

    expect(screen.getByText("example.ts")).toBeInTheDocument();

    const code = document.querySelector("code");
    expect(code).toBeTruthy();
    expect(code).toHaveTextContent(source);

    const spans = [...code!.querySelectorAll("span")];
    const keyword = spans.find((span) => span.textContent === "const");
    const string = spans.find((span) => span.textContent?.includes("app-kit"));
    expect(keyword).toBeTruthy();
    expect(string).toBeTruthy();
    expect(keyword!.getAttribute("style")).not.toBe(
      string!.getAttribute("style")
    );
    expect(keyword!.getAttribute("style")).toMatch(/--shiki-light/);
    expect(keyword!.getAttribute("style")).toMatch(/--shiki-dark/);

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(source);
    });
  });

  it.each([
    {
      language: "tsx" as const,
      label: "usage.tsx",
      source: "export function Demo() {\n  return <Button />;\n}",
      token: "function",
      other: "Button",
    },
    {
      language: "shell" as const,
      label: "install.sh",
      source: 'echo "app-kit"',
      token: "echo",
      other: "app-kit",
    },
    {
      language: "json" as const,
      label: "item.json",
      source: '{"name":"app-kit"}',
      token: "name",
      other: "app-kit",
    },
  ])(
    "highlights $language tokens and copies source",
    async ({ language, label, source, token, other }) => {
      render(await CodeBlock({ code: source, language, label }));

      expect(screen.getByText(label)).toBeInTheDocument();
      const tokens = [...document.querySelectorAll("code span[style]")];
      const first = tokens.find((span) => span.textContent?.includes(token));
      const second = tokens.find((span) => span.textContent?.includes(other));
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(first!.getAttribute("style")).not.toBe(
        second!.getAttribute("style")
      );
      expect(first!.getAttribute("style")).toMatch(/--shiki-light/);
      expect(first!.getAttribute("style")).toMatch(/--shiki-dark/);

      fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(source);
      });
    }
  );
});

describe("InstallCommand", () => {
  it("shows the canonical @app-kit add command", () => {
    render(<InstallCommand doc={doc} />);

    expect(
      screen.getByText(`bunx shadcn@latest add @app-kit/${doc.slug}`)
    ).toBeInTheDocument();
  });

  it("shows namespace registration once", () => {
    render(<InstallCommand doc={doc} />);

    expect(
      screen.getByText(/register the @app-kit namespace once/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "bunx shadcn@latest registry add @app-kit=<origin>/r/{name}.json"
      )
    ).toBeInTheDocument();
  });
});
