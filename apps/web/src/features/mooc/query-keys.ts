// 层级 query key：域 key 是所有子 key 的前缀（features/_keys.test.ts 守护）。
export const moocQueryKeys = {
  all: ["mooc"] as const,
  list: (knowledgeId: number) => ["mooc", "list", knowledgeId] as const,
  items: (moocId: number, parentId: number) => ["mooc", "items", moocId, parentId] as const,
  itemDetail: (moocId: number, moocItemId: number) => ["mooc", "item", moocId, moocItemId] as const,
  objectUrl: (objectName: string) => ["mooc", "object-url", objectName] as const,
};
