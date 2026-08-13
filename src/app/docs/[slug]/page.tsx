import { notFound } from "next/navigation";
import { Sidebar } from "@/components/docs-shell";
import { DocPageView } from "@/components/doc-page";
import { getCompleteDoc } from "@/lib/complete-docs";
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
      <DocPageView doc={doc} complete={getCompleteDoc(slug)} />
    </div>
  );
}
