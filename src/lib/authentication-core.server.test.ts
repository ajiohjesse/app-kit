import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServerSessionReader } from "../../infra/authentication-core.server";
import { toSession } from "../../infra/authentication-core";

describe("authentication-core server module", () => {
  it("starts with server-only and is omitted from client exports", async () => {
    const serverSource = await readFile(
      join(process.cwd(), "infra/authentication-core.server.ts"),
      "utf8"
    );
    const clientSource = await readFile(
      join(process.cwd(), "infra/authentication-core-provider.tsx"),
      "utf8"
    );
    const libSource = await readFile(
      join(process.cwd(), "infra/authentication-core.ts"),
      "utf8"
    );

    expect(serverSource.trimStart().startsWith('import "server-only"')).toBe(
      true
    );
    expect(clientSource).not.toMatch(/authentication-core\.server/);
    expect(libSource).not.toMatch(/authentication-core\.server/);
    expect(clientSource).not.toMatch(/import\s+["']server-only["']/);
    expect(libSource).not.toMatch(/import\s+["']server-only["']/);
  });

  it("builds a secret-free session seed from a server read", async () => {
    const credential = "cookie-session-secret";
    const reader = createServerSessionReader({
      read: ({ request }) => {
        expect(request).toEqual({ credential });
        return {
          user: { id: "user-1", name: "Test User" },
          expiresAt: "2030-01-01T00:00:00.000Z",
          accessToken: credential,
        };
      },
    });

    const seed = await reader.toSessionSeed({
      request: { credential },
    });

    expect(seed).toEqual({
      user: { id: "user-1", name: "Test User" },
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(JSON.stringify(seed)).not.toMatch(/cookie-session-secret/);
    expect(toSession).toEqual(expect.any(Function));
  });

  it("does not export the server factory from the client module", async () => {
    const client = await import("../../infra/authentication-core-provider");
    expect(client).not.toHaveProperty("createServerSessionReader");
  });
});
