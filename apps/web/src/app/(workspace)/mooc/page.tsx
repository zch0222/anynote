import { redirect } from "next/navigation";

/**
 * 旧地址 `/mooc` → `/notes`（F-01「建议重定向」）。
 *
 * 2026-09-15 拍板：慕课只属于知识库，跨库课程列表不再作为入口。
 * 没有 id 可以推导出知识库，所以一律落到知识库列表；
 * 保留这条路由而不是直接删掉，是因为旧书签与分享链接还会带进来。
 */
export default function Page() {
  redirect("/notes");
}
