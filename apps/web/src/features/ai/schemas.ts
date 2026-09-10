import { z } from "zod";

/** 分页信封：rows 由调用方传入的 schema 逐条校验（与 notes 域同一后端结构，域内自治）。 */
export function pageBeanSchema<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    current: z.number().nullish(),
    pages: z.number().nullish(),
    total: z.number().nullish(),
    rows: z
      .array(row)
      .nullish()
      .transform((rows) => rows ?? []),
  });
}

export const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// 会话（/chat/conversations）

export const conversationSchema = z.object({
  id: z.number(),
  title: z.string().nullish(),
  type: z.number().nullish(),
  docId: z.number().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** 服务端消息 role：0 用户 / 1 助手（2 system 不在对话 UI 展示）。 */
export const chatMessageSchema = z.object({
  id: z.number().nullish(),
  content: z.string().nullish(),
  role: z.number().nullish(),
  orderIndex: z.number().nullish(),
  createTime: z.string().nullish(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationDetailSchema = z.object({
  conversation: conversationSchema.nullish().transform((value) => value ?? undefined),
  messages: z
    .array(chatMessageSchema)
    .nullish()
    .transform((messages) => messages ?? []),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

// ---------------------------------------------------------------------------
// 流式 chunk（lib/ai/sse 解码后的业务载荷）

export const streamMessageRole = z.union([z.literal(0), z.literal(1)]);
export type StreamMessageRole = z.infer<typeof streamMessageRole>;

// ---------------------------------------------------------------------------
// Chat PDF（/docs）

export const docSchema = z.object({
  id: z.number(),
  docName: z.string().nullish(),
  knowledgeBaseId: z.number().nullish(),
  /** 0/1 之外的值按「未索引」处理，后端加枚举不致前端崩。 */
  indexStatus: z.number().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
});
export type Doc = z.infer<typeof docSchema>;

export const docDetailSchema = docSchema.extend({
  url: z.string().nullish(),
  creatorNickname: z.string().nullish(),
});
export type DocDetail = z.infer<typeof docDetailSchema>;

export const DOC_INDEXED = 1;

// ---------------------------------------------------------------------------
// AI 工作流（M7.2，纯前端编排，节点/边持久化到 localStorage）

export const workflowNodeDataSchema = z.object({
  label: z.string().trim().min(1, "节点名称不能为空").max(30),
  /** whisper 节点的转写提示词（占位，后端执行端点接入后生效）。 */
  prompt: z.string().max(500).optional(),
});
export type WorkflowNodeData = z.infer<typeof workflowNodeDataSchema>;

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["start", "whisper"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: workflowNodeDataSchema,
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowDataSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1, "工作流至少需要一个开始节点"),
  edges: z.array(workflowEdgeSchema),
});
export type WorkflowData = z.infer<typeof workflowDataSchema>;
