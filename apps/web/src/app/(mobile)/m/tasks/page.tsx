import { redirect } from "next/navigation";

/**
 * 旧地址 `/m/tasks` → `/m/notes`（F-02 规则 R）。
 *
 * 2026-09-15 拍板：任务只属于知识库。移动端没有"跨库任务列表"这个信息层级了，
 * 所以落到知识库列表，由用户选库后进本库的任务 Tab。
 */
export default function Page() {
  redirect("/m/notes");
}
