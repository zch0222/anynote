/** TanStack Query Key 工厂：集中管理便于精确失效 */
export const queryKeys = {
  session: ['session'] as const,
  agentRunStats: (params: Record<string, unknown>) => ['agent-run-stats', params] as const,
  agentRuns: (params: Record<string, unknown>) => ['agent-runs', params] as const,
  agentRun: (runId: string) => ['agent-run', runId] as const,
  agentRunEvents: (runId: string) => ['agent-run-events', runId] as const,
  modelProviders: () => ['model-providers'] as const,
  logicalModel: (name: string) => ['logical-model', name] as const,
  retrievalSettings: () => ['retrieval-settings'] as const,
}
