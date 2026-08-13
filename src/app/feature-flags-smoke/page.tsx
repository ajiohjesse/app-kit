import { createServerFlagAdapter } from "../../../infra/feature-flags.server";
import { featureFlagsSmokeSchema } from "./schema";
import { FeatureFlagsSmokeClient } from "./smoke-client";

export default async function FeatureFlagsSmokePage() {
  const adapter = createServerFlagAdapter({
    schema: featureFlagsSmokeSchema,
    schemaVersion: "flags-v1",
    read: () => {
      const credential = "sdk-live-secret";
      void credential;
      return {
        checkout: true,
        theme: "dark",
        internalPlan: "ops-gold",
      };
    },
  });
  const snapshot = await adapter.snapshot();
  return <FeatureFlagsSmokeClient snapshot={snapshot} />;
}
