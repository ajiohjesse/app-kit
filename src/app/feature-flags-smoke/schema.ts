export const featureFlagsSmokeSchema = {
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
  internalPlan: {
    type: "variant" as const,
    variants: ["hidden", "ops-gold"] as const,
    default: "hidden",
    exposure: "server-only" as const,
  },
};
