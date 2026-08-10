import { CopyButton } from "./copy-button";
import type { DocItem } from "@/lib/docs";
export function ComponentPreview() {
  return (
    <div className="preview">
      <div className="preview-grid" />
      <span className="preview-label">Live component preview</span>
      <span className="preview-note">
        Implementation reserved for the next pass
      </span>
    </div>
  );
}
export function CodeBlock({
  code,
  label = "example.tsx",
}: {
  code: string;
  label?: string;
}) {
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="mono">{label}</span>
        <CopyButton value={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
export function InstallCommand({ doc }: { doc: DocItem }) {
  const command = `bunx shadcn add https://your-domain.com/r/${doc.slug}.json`;
  return (
    <div className="install">
      <span className="install-label">Install via registry</span>
      <code>{command}</code>
      <CopyButton value={command} />
    </div>
  );
}
export function ApiReference() {
  return (
    <section className="doc-section">
      <div className="section-kicker">API reference</div>
      <div className="empty-api">
        <span className="mono">{"// API surface to be finalized"}</span>
        <span>Placeholder slot for the typed API, props, and defaults.</span>
      </div>
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
