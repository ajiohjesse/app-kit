import "server-only";

import {
  toSession,
  type Session,
  type SessionSeed,
} from "@/infra/authentication-core";

export type ServerSessionReadInput = {
  request?: unknown;
};

export type ServerSessionReader = {
  getSession: (input?: ServerSessionReadInput) => Promise<Session | null>;
  toSessionSeed: (
    input?: ServerSessionReadInput
  ) => Promise<SessionSeed | null>;
};

export function createServerSessionReader(config: {
  read: (input: ServerSessionReadInput) => Promise<unknown> | unknown;
}): ServerSessionReader {
  return {
    async getSession(input = {}) {
      return toSession(await config.read(input));
    },
    async toSessionSeed(input = {}) {
      return toSession(await config.read(input));
    },
  };
}
