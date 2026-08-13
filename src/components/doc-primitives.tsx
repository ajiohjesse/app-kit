import type { ReactNode } from "react";
import { codeToHtml } from "shiki";
import { CopyButton } from "./copy-button";
import type { DocItem } from "@/lib/docs";

export type DocCodeLanguage = "typescript" | "tsx" | "shell" | "json";

const shikiLang: Record<DocCodeLanguage, string> = {
  typescript: "typescript",
  tsx: "tsx",
  shell: "bash",
  json: "json",
};

export function ComponentPreview({ children }: { children?: ReactNode }) {
  return (
    <div className="preview">
      <div className="preview-grid" />
      {children ? (
        <div className="preview-body">{children}</div>
      ) : (
        <>
          <span className="preview-label">Live component preview</span>
          <span className="preview-note">
            Implementation reserved for the next pass
          </span>
        </>
      )}
    </div>
  );
}
export async function CodeBlock({
  code,
  label = "example.tsx",
  language = "tsx",
}: {
  code: string;
  label?: string;
  language?: DocCodeLanguage;
}) {
  const highlighted = await codeToHtml(code, {
    lang: shikiLang[language],
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  });
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="mono">{label}</span>
        <CopyButton value={code} />
      </div>
      <div
        className="code-highlight"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
export function InstallCommand({ doc }: { doc: DocItem }) {
  const command = `bunx shadcn@latest add @app-kit/${doc.slug}`;
  const register =
    "bunx shadcn@latest registry add @app-kit=<origin>/r/{name}.json";
  return (
    <div className="install">
      <div className="install-row">
        <span className="install-label">Install via registry</span>
        <code>{command}</code>
        <CopyButton value={command} />
      </div>
      <p className="install-once">
        Register the @app-kit namespace once: <code>{register}</code>
      </p>
    </div>
  );
}
export function ApiReference({ children }: { children?: ReactNode }) {
  return (
    <section className="doc-section">
      <div className="section-kicker">API reference</div>
      {children ? (
        <div className="api-body">{children}</div>
      ) : (
        <div className="empty-api">
          <span className="mono">{"// API surface to be finalized"}</span>
          <span>Placeholder slot for the typed API, props, and defaults.</span>
        </div>
      )}
    </section>
  );
}
export function OpenQuestions({ questions }: { questions: string[] }) {
  return (
    <section className="questions">
      <div className="section-kicker">Open questions</div>
      <p className="questions-intro">
        These are intentionally unresolved. Each will be taken through design
        review before implementation.
      </p>
      <ul>
        {questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
    </section>
  );
}
