import {
  ApiReference,
  CodeBlock,
  ComponentPreview,
  InstallCommand,
  OpenQuestions,
} from "@/components/doc-primitives";
import type { CompleteDocSlots, DocExample } from "@/lib/complete-docs";
import type { DocItem } from "@/lib/docs";

function placeholderExample(doc: DocItem): DocExample {
  return {
    label: "usage.tsx",
    language: "tsx",
    code: `import { ${doc.shortTitle.replaceAll(" ", "")} } from '@/infra/${doc.slug}'\n\n// Implementation placeholder — design review comes first.`,
  };
}

async function renderExamples(examples: DocExample[]) {
  const blocks = await Promise.all(
    examples.map((example) =>
      CodeBlock({
        code: example.code,
        label: example.label,
        language: example.language,
      })
    )
  );
  return blocks.map((block, index) => (
    <div key={examples[index].label}>{block}</div>
  ));
}

export async function DocPageView({
  doc,
  complete,
}: {
  doc: DocItem;
  complete?: CompleteDocSlots;
}) {
  const usage = await renderExamples(
    complete?.examples ?? [placeholderExample(doc)]
  );
  const spaRecipes = complete?.spaRecipes?.length
    ? await renderExamples(complete.spaRecipes)
    : null;
  const nextRecipes = complete?.nextRecipes?.length
    ? await renderExamples(complete.nextRecipes)
    : null;

  return (
    <main className="doc-page">
      <div className="doc-breadcrumb mono">
        {doc.category} <span>/</span> {String(doc.number).padStart(2, "0")}
      </div>
      <div className="doc-title-row">
        <div>
          <h1>{doc.title}</h1>
          <p className="doc-problem">{doc.problem}</p>
        </div>
        {complete ? null : (
          <span className="placeholder-badge">placeholder</span>
        )}
      </div>
      <InstallCommand doc={doc} />
      <ComponentPreview>{complete?.preview}</ComponentPreview>
      <section className="doc-section">
        <div className="section-kicker">Usage</div>
        {usage}
      </section>
      {spaRecipes ? (
        <section className="doc-section">
          <div className="section-kicker">SPA</div>
          {spaRecipes}
        </section>
      ) : null}
      {nextRecipes ? (
        <section className="doc-section">
          <div className="section-kicker">Next.js</div>
          {nextRecipes}
        </section>
      ) : null}
      <ApiReference>{complete?.api}</ApiReference>
      {complete ? (
        complete.limitations?.length ? (
          <section className="doc-section">
            <div className="section-kicker">Limitations</div>
            <ul className="limitations">
              {complete.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        ) : null
      ) : (
        <OpenQuestions questions={doc.questions} />
      )}
    </main>
  );
}
