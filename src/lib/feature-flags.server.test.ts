import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServerFlagAdapter } from "../../infra/feature-flags.server";
import { createFlagSnapshot, type FlagSchema } from "../../infra/feature-flags";

const schema = {
  checkout: {
    type: "boolean",
    default: false,
    exposure: "public",
  },
  internalBilling: {
    type: "boolean",
    default: false,
    exposure: "server-only",
  },
} as const satisfies FlagSchema;

describe("feature-flags server module", () => {
  it("starts with server-only and is omitted from client exports", async () => {
    const serverSource = await readFile(
      join(process.cwd(), "infra/feature-flags.server.ts"),
      "utf8"
    );
    const clientSource = await readFile(
      join(process.cwd(), "infra/feature-flags-provider.tsx"),
      "utf8"
    );
    const libSource = await readFile(
      join(process.cwd(), "infra/feature-flags.ts"),
      "utf8"
    );

    expect(serverSource.trimStart().startsWith('import "server-only"')).toBe(
      true
    );
    expect(clientSource).not.toMatch(/feature-flags\.server/);
    expect(libSource).not.toMatch(/feature-flags\.server/);
    expect(clientSource).not.toMatch(/import\s+["']server-only["']/);
    expect(libSource).not.toMatch(/import\s+["']server-only["']/);
  });

  it("evaluates server-only flags without putting credentials on the snapshot", async () => {
    const credential = "sdk-live-secret";
    const adapter = createServerFlagAdapter({
      schema,
      schemaVersion: "flags-v1",
      read: ({ request }) => {
        expect(request).toEqual({ credential });
        return { checkout: true, internalBilling: true };
      },
    });

    const clientSnapshot = await adapter.snapshot({
      request: { credential },
    });
    const serverSnapshot = await adapter.snapshot({
      request: { credential },
      includeServerOnly: true,
    });

    expect(clientSnapshot.values).toEqual({ checkout: true });
    expect(JSON.stringify(clientSnapshot)).not.toMatch(/sdk-live-secret/);
    expect(JSON.stringify(clientSnapshot)).not.toMatch(/internalBilling/);
    expect(serverSnapshot.values.internalBilling).toBe(true);
    expect(JSON.stringify(serverSnapshot)).not.toMatch(/sdk-live-secret/);
  });

  it("does not export the server factory from the client module", async () => {
    const client = await import("../../infra/feature-flags-provider");
    expect(client).not.toHaveProperty("createServerFlagAdapter");
    expect(createFlagSnapshot).toEqual(expect.any(Function));
  });
});
