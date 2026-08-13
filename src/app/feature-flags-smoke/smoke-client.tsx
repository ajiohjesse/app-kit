"use client";

import {
  FeatureFlagProvider,
  useFlag,
} from "../../../infra/feature-flags-provider";
import type { FlagSnapshot } from "../../../infra/feature-flags";
import { featureFlagsSmokeSchema } from "./schema";

function SmokeBody() {
  return (
    <main>
      <h1>feature-flags smoke</h1>
      <p>checkout:{String(useFlag("checkout"))}</p>
      <p>theme:{String(useFlag("theme"))}</p>
    </main>
  );
}

export function FeatureFlagsSmokeClient({
  snapshot,
}: {
  snapshot: FlagSnapshot;
}) {
  return (
    <FeatureFlagProvider
      schema={featureFlagsSmokeSchema}
      schemaVersion="flags-v1"
      snapshot={snapshot}
    >
      <SmokeBody />
    </FeatureFlagProvider>
  );
}
