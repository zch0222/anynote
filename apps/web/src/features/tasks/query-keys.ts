import type { SubmissionTab } from "./schemas";

// 层级 query key：域 key 是所有子 key 的前缀（features/_keys.test.ts 守护）。
export const taskQueryKeys = {
  all: ["tasks"] as const,
  list: (knowledgeBaseId: number, page: number) =>
    ["tasks", "list", knowledgeBaseId, page] as const,
  /**
   * 管理员任务详情。放在 `admin` 子树下而不是 `detail`：
   * 成员视角走的是列表端点（成员侧没有按 id 取单条的接口），
   * 两者语义不同、缓存也不能互相冒用。
   */
  adminDetail: (taskId: number) => ["tasks", "admin", "detail", taskId] as const,
  /** 提交记录：每个 tab 一棵子树，切 tab 不会与上一个 tab 抢同一个缓存位。 */
  submissions: (taskId: number, status: SubmissionTab, page: number) =>
    ["tasks", "admin", "submissions", taskId, status, page] as const,
  /** 提交记录整棵子树：退回后要失效**所有** tab（那一行会从「已提交」移到「已退回」）。 */
  submissionsAll: (taskId: number) => ["tasks", "admin", "submissions", taskId] as const,
  /** 成员编辑活跃度（B-1 新端点）。 */
  heatmap: (taskId: number) => ["tasks", "admin", "heatmap", taskId] as const,
  /** 任务时间线（成员视角的「我的提交」）。 */
  timeline: (taskId: number) => ["tasks", "timeline", taskId] as const,
};
