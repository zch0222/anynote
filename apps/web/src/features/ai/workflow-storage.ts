import { type WorkflowData, workflowDataSchema } from "./schemas";

/**
 * AI 工作流（M7.2）：节点 / 边是纯前端编排，持久化到 localStorage；
 * 后端执行端点尚未提供（与旧前端一致），schema 校验是将来对接的契约边界。
 */

const WORKFLOW_STORAGE_KEY = "anynote-ai-workflow";

export function loadWorkflow(): WorkflowData | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return workflowDataSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 校验并保存；数据非法时返回 undefined，由调用方提示。 */
export function validateWorkflow(data: WorkflowData): WorkflowData | undefined {
  const parsed = workflowDataSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

export function saveWorkflow(data: WorkflowData): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(data));
  return true;
}

/**
 * 执行工作流的对接点。当前后端没有工作流执行端点
 * （services/ai 只暴露 chat / rag / whisper / translate），保留异步契约：
 * 接入时把这里换成真实调用，画布层无需改动。
 */
export async function runWorkflow(data: WorkflowData): Promise<void> {
  const parsed = workflowDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "工作流数据不合法");
  }
  throw new Error("后端工作流执行端点尚未接入");
}
