import { CliAuthorize } from "@/features/auth/components/cli-authorize";
import { parseCliAuthorizeParams } from "@/lib/auth/cli-authorize";
import { safeNextPath } from "@/lib/auth/redirect";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "授权 CLI 登录 · Anynote",
  // 授权页带一次性 state 与 PKCE challenge，不该被搜索引擎或缓存收录。
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 把 Next 的 searchParams 收敛成 URLSearchParams，只取第一次出现的值。 */
function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) params.set(key, single);
  }
  return params;
}

/**
 * CLI 浏览器授权登录页。
 *
 * 这条路由被 middleware **排除**（见 `middleware.ts` 的 matcher），因此未登录用户也会
 * 落到这里；本页自己检查会话并把完整参数带进 `next`，保证登录后回到本页继续授权。
 *
 * 参数非法时不跳登录、也不渲染授权按钮，直接给出可读的错误——这类请求多半是手改的
 * URL 或过期的 CLI 链接，让用户看到"链接无效"比让他登录一遍再失败更省事。
 */
export default async function CliAuthorizePage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = toSearchParams(raw);
  const parsed = parseCliAuthorizeParams(params);

  if (!parsed.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">授权链接无效</h1>
        <p className="mb-6 mt-2 text-sm text-label-secondary">{parsed.reason}。</p>
        <p className="text-sm text-label-secondary">
          请在终端重新执行 <code className="rounded bg-grouped px-1">anynote auth login</code>，
          不要手工修改或复用旧链接。
        </p>
      </>
    );
  }

  // 页面层只判断 Cookie 是否存在；真实身份仍由 BFF 与 Gateway 验证。
  const authenticated = Boolean((await cookies()).get("at")?.value);
  if (!authenticated) {
    const next = `/cli/authorize?${params.toString()}`;
    redirect(`/login?next=${encodeURIComponent(safeNextPath(next, "/dashboard"))}`);
  }

  return <CliAuthorize params={parsed.params} />;
}
