"use client";

import { Button } from "@/components/ui/button";
import type { CliAuthorizeParams } from "@/lib/auth/cli-authorize";
import { ShieldCheck, Terminal } from "lucide-react";
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
 *
 * 回调端口单独显示一行（D-15 图例 4）不是装饰：**它是防诱导授权的那把尺子**。
 * 用户可以在终端里看到 CLI 实际监听的端口，对不上就说明这个链接来路不明。
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
      <h1 className="text-title text-label">授权 CLI 登录</h1>
      <p className="mb-6 mt-2 text-body text-label-secondary">
        命令行工具请求访问你的 Anynote 账号。授权后它会拿到一对
        {/* 这里用 <strong> 而不是 Markdown 的 `**`：旧文案把星号原样渲染出来了 */}
        <strong className="font-semibold text-label">独立的</strong>
        令牌，与当前浏览器会话互不影响。
      </p>
      <div className="space-y-4">
        <AccountBadge />
        {/* D-15 图例 4：终端图标 + 回调端口，方便用户和终端里的地址核对 */}
        <p className="flex items-center gap-1.5 text-footnote text-label-secondary">
          <Terminal className="size-4 shrink-0" aria-hidden="true" />
          回调到本机 127.0.0.1:{params.port}
        </p>
        <div className="flex gap-2">
          {/*
            D-15 图例 5：主按钮 42 高、全宽占满剩余宽度、**带 ShieldCheck 图标**。
            盾牌图标不是装饰：这一屏是"把账号凭据交给一个本机进程"，
            图标是用户扫一眼就能认出的风险提示；原来只有一个裸的「授权」。
          */}
          <Button
            type="button"
            className="h-[42px] flex-1"
            onClick={authorize}
            disabled={mutation.isPending}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {mutation.isPending ? "授权中…" : "授权"}
          </Button>
          {/* D-15 图例 6：次按钮同为 42 高，两个按钮等高才对齐 */}
          <Button
            type="button"
            variant="outline"
            className="h-[42px]"
            onClick={() => router.push("/dashboard")}
            disabled={mutation.isPending}
          >
            取消
          </Button>
        </div>
        {/* D-15 图例 7：把 PKCE 讲成人话，不再说"不会出现在地址栏以外的地方" */}
        <p className="text-xs text-label-tertiary">
          授权码只在本机 CLI 与服务器之间传递，60 秒内有效，必须配合 CLI 私有的校验码才能兑换。
        </p>
      </div>
    </>
  );
}
