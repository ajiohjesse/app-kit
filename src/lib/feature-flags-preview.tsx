"use client";

import {
  FeatureFlagProvider,
  useFlag,
} from "../../infra/feature-flags-provider";
import { createFlagSnapshot } from "../../infra/feature-flags";

const schema = {
  checkout: {
    type: "boolean" as const,
    default: false,
    exposure: "public" as const,
  },
  theme: {
    type: "variant" as const,
    variants: ["light", "dark"] as const,
    default: "light",
    exposure: "public" as const,
  },
};

const { snapshot } = createFlagSnapshot(schema, {
  schemaVersion: "flags-v1",
  values: { checkout: true, theme: "dark" },
});

function PreviewBody() {
  const checkout = useFlag("checkout");
  const theme = useFlag("theme");
  return (
    <div className="usage-sketch">
      <p>
        <span className="mono">checkout</span>
        {" → "}
        {String(checkout)}
      </p>
      <p>
        <span className="mono">theme</span>
        {" → "}
        {String(theme)}
      </p>
    </div>
  );
}

export function FeatureFlagsPreview() {
  return (
    <FeatureFlagProvider
      schema={schema}
      schemaVersion="flags-v1"
      snapshot={snapshot}
    >
      <PreviewBody />
    </FeatureFlagProvider>
  );
}
