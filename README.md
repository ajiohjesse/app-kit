# app-kit

Reusable web infrastructure for Next.js apps, distributed as source. This is a documentation site and a shadcn-compatible registry — not an npm component library.

## Run locally

```bash
bun install
bun dev
```

Open `http://localhost:3000`. The site uses Next.js App Router, TypeScript, Tailwind, Geist, Motion, next-themes, MDX, and shadcn/ui with Base UI primitives.

## Registry distribution

Each future component will be shipped as a registry item. Consumers can copy the source into their own project with:

```bash
bunx shadcn add https://your-domain.com/r/modal-manager.json
```

The root `registry.json` is the source of truth. Run `bun run registry:build` to generate CLI-consumable JSON files under `public/r`.

## Adding a component

1. Add one record to `src/lib/docs.ts` with its category, problem statement, and unresolved design questions from `.scratch/initial-spec.md`.
2. Add the component’s source files and registry metadata to `registry.json`.
3. Run `bun run registry:build` and confirm the generated `public/r/<name>.json` exists.
4. Visit `/docs/<slug>` and verify the preview, code block, API slot, install command, and open questions.

`.scratch/initial-spec.md` is the design source of record. Keep it untouched while the component designs are being refined.
