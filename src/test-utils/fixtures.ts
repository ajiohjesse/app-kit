export type SessionSeed = {
  user: { id: string; name: string };
  expiresAt: string;
};

export function createSessionSeed(overrides: Partial<SessionSeed> = {}): SessionSeed {
  return {
    user: { id: "user-test-1", name: "Test User" },
    expiresAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createOverlayFixture() {
  return {
    activeLayerIds: [] as string[],
    suspendedLayerIds: [] as string[],
    focusReturnTarget: "trigger",
  };
}
