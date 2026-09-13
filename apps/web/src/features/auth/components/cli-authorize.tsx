"use client";

import { Button } from "@/components/ui/button";
import type { CliAuthorizeParams } from "@/lib/auth/cli-authorize";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCliAuthorizeMutation } from "../use-cli-authorize-mutation";
import { AccountBadge } from "./account-badge";

/**
 * CLI 授权确认。
 *
 * **必须有这一步用户手势**：`/cli/authorize` 被中间件排除在登录保护之外，任何本机进程
 * 都能诱导用户打开一个带 `port` + `state` 的链接。如果页面一进来就自动回传授权码，
 * 恶意进程只要抢先占住那个回环端口就能白拿一份用户凭据。要求点一次按钮，
 * 用户至少有机会看到"正在给哪个账号授权"。
 *
 * 授权成功后浏览器**导航到 CLI 的回环地址**（`http://127.0.0.1:<port>/callback`）：
 * 这个请求由 CLI 的本地服务接收，CLI 校验 state 后再自己向后端兑换 Token。
 */
export function CliAuthorize({ params }: { params: CliAuthorizeParams }) {
  const router = useRouter();
  const mutation = useCliAuthorizeMutation();

  const authorize = async () => {
    try {
      const result = await mutation.mutateAsync({
        port: params.port,
        state: params.state,
        codeChallenge: params.challenge,
      });
      // 用整页导航而不是 router.push：目标是 CLI 的回环服务，不是 Next 的路由。
      window.location.assign(result.redirectTo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "授权失败，请稍后重试");
      mutation.reset();
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">授权 CLI 登录</h1>
      <p className="mb-6 mt-2 text-sm text-label-secondary">
        命令行工具请求访问你的 Anynote 账号。授权后它会获得一对**独立的**令牌，
        与当前浏览器会话互不影响。
      </p>
      <div className="space-y-4">
        <AccountBadge />
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={authorize}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "授权中…" : "授权"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard")}
            disabled={mutation.isPending}
          >
            取消
          </Button>
        </div>
        <p className="text-xs text-label-secondary">
          授权码只在本机 CLI 与服务器之间传递，不会出现在浏览器地址栏以外的任何地方。
        </p>
      </div>
    </>
  );
}
