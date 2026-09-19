import { LandingPage } from "@/features/landing/components/landing-page";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 官网首页（D-19 / M-14）。
 *
 * ## 为什么不再直接 `redirect("/dashboard")`
 *
 * 画板的落地说明写得很清楚：`/` 直接重定向到 `/dashboard` 时，**未登录的人撞上的是登录页**，
 * 站点没有任何一页回答「这是什么、能干什么、怎么开始」。这一页就是那个答案。
 *
 * ## 四种入口的分工（互不重叠）
 *
 * | 谁 | 结果 | 在哪判定 |
 * |---|---|---|
 * | 未登录访客（桌面 / 手机） | 看到本页 | `middleware` 的 `PUBLIC_PATHS` 放行 |
 * | 已登录 · 桌面 | 307 到 `/dashboard` → `/notes` | 本页 |
 * | 已登录 · 手机 | 307 到 `/m/dashboard` | `middleware` 的版式分流（先于本页执行） |
 *
 * 手机分流必须在 middleware 里做，不能挪到这里：它还要顺手写版式偏好 Cookie，
 * 而 Server Component 改不了响应头。middleware 已经把 `?desktop=1` 这类逃生口处理完了，
 * 所以能走到本页的、带登录态的请求只可能是「走桌面形态」的。
 *
 * 判据只看 Cookie 是否存在，与 middleware 同口径——真正的身份校验由 BFF 与 Gateway
 * 完成。这里**不调 `/api/auth/me`**：为一个跳转判断去发一次后端请求，会让每个已登录
 * 访客的首屏都多等一个 RTT，而 Cookie 过期这种边界最终也会被业务页自己的 401 兜住。
 */
export const metadata: Metadata = {
  title: "Anynote · 把知识，安顿在一个安静的地方",
  description:
    "知识库、笔记、慕课、任务与协同文档，收进同一个工作台。支持 AI 问答与 PDF 问答，可自托管部署。",
};

export default async function HomePage() {
  // `cookies()` 让这条路由转为动态渲染：已登录访客的跳转结果不能被静态化后发给所有访客
  const store = await cookies();
  if (store.get("at")?.value) redirect("/dashboard");

  return <LandingPage />;
}
