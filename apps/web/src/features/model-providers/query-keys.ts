export const modelProviderQueryKeys = {
  all: ["model-providers"] as const,
  list: ["model-providers", "list"] as const,
  logical: (logicalName: string) => ["model-providers", "logical", logicalName] as const,
};
