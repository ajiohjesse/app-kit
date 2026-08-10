import { notFound } from "next/navigation";
import { Sidebar } from "@/components/docs-shell";
import {
  ComponentPreview,
  ApiReference,
  InstallCommand,
  OpenQuestions,
  CodeBlock,
} from "@/components/doc-primitives";
import { docs, getDoc } from "@/lib/docs";
export function generateStaticParams() {
  return docs.map(({ slug }) => ({ slug }));
}
export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();
  return (
    <div className="app-frame">
      <Sidebar />
      <main className="doc-page">
        <div className="doc-breadcrumb mono">
          {doc.category} <span>/</span> {String(doc.number).padStart(2, "0")}
        </div>
        <div className="doc-title-row">
          <div>
            <h1>{doc.title}</h1>
            <p className="doc-problem">{doc.problem}</p>
          </div>
          <span className="placeholder-badge">placeholder</span>
        </div>
        <InstallCommand doc={doc} />
        <ComponentPreview />
        <section className="doc-section">
          <div className="section-kicker">Usage</div>
          <CodeBlock
            label="usage.tsx"
            code={`import { ${doc.shortTitle.replaceAll(" ", "")} } from '@/infra/${doc.slug}'\n\n// Implementation placeholder — design review comes first.`}
          />
        </section>
        <ApiReference />
        <OpenQuestions questions={doc.questions} />
      </main>
    </div>
  );
}
