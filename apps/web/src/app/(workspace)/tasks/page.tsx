import { redirect } from "next/navigation";

/**
 * 旧地址 `/tasks` → `/notes`（F-01「建议重定向」）。
 *
 * 2026-09-15 拍板：任务只属于知识库。没有 id 可以推导出知识库，
 * 所以落到知识库列表；保留路由以承接旧书签。
 */
export default function Page() {
  redirect("/notes");
}
