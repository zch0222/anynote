import { redirect } from "next/navigation";

/**
 * 重设计后知识库是唯一的顶层对象，所以工作台不再单独成页：
 * `/dashboard` 保留为**登录后的稳定落地地址**（middleware 的入口分流与既有书签都在用它），
 * 内容直接呈现知识库画廊。
 *
 * query 必须原样带走：`?desktop=1` / `?mobile=1` 是版式逃生口，
 * middleware 已经在本次请求上写好了偏好 Cookie，重定向若把它丢掉，
 * 用户在地址栏里就看不到自己刚做的选择（且 E2E 的逃生口用例会失败）。
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/notes${suffix}`);
}
