import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { docs, categories } from "@/lib/docs";
import { Sidebar } from "@/components/docs-shell";
export default function Home() {
  return (
    <div className="app-frame">
      <Sidebar />
      <main className="home">
        <div className="home-eyebrow">
          <span className="status-dot" /> design system / registry / v0.1
        </div>
        <h1>
          Infrastructure you can
          <br />
          <em>understand</em> and own.
        </h1>
        <p className="home-lede">
          A living collection of copy-paste React and TypeScript infrastructure
          components. Built for the seams between product features — not as
          another library to install.
        </p>
        <div className="home-actions">
          <Link href="/docs/modal-manager" className="button-primary">
            Browse the components <ArrowRight size={15} />
          </Link>
          <div className="stack-note">
            <Terminal size={14} />
            <code>bunx shadcn add &lt;url&gt;/component.json</code>
          </div>
        </div>
        <div className="principles">
          <div>
            <span>01</span>
            <strong>Copy, don’t depend</strong>
            <p>
              Source lands in your project through the shadcn registry pattern.
            </p>
          </div>
          <div>
            <span>02</span>
            <strong>Decisions stay visible</strong>
            <p>Every page carries the open questions behind the design.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Built for Next.js</strong>
            <p>
              SSR, RSC, client boundaries, and the uncomfortable edges are
              documented.
            </p>
          </div>
        </div>
        <div className="catalog-head">
          <div>
            <div className="section-kicker">The catalog</div>
            <h2>Twenty pieces of application infrastructure.</h2>
          </div>
          <span className="catalog-count mono">
            {String(docs.length).padStart(2, "0")} components
          </span>
        </div>
        <div className="catalog">
          {categories.map((category) => (
            <div className="catalog-group" key={category}>
              <div className="catalog-category">{category}</div>
              {docs
                .filter((d) => d.category === category)
                .map((doc) => (
                  <Link
                    className="catalog-item"
                    href={`/docs/${doc.slug}`}
                    key={doc.slug}
                  >
                    <span className="catalog-number mono">
                      {String(doc.number).padStart(2, "0")}
                    </span>
                    <span>{doc.title}</span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
