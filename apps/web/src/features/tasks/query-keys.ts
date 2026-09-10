// 层级 query key：域 key 是所有子 key 的前缀（features/_keys.test.ts 守护）。
export const taskQueryKeys = {
  all: ["tasks"] as const,
  list: (knowledgeBaseId: number, page: number) =>
    ["tasks", "list", knowledgeBaseId, page] as const,
};
