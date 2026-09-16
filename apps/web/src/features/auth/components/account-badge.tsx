"use client";

import { useMe } from "../use-me";

/**
 * 授权页要展示的当前账号信息；`meProfileSchema` 已保证形状，这里只做展示收敛。
 * 昵称优先，回落到用户名，再回落到占位符——三者都空不该发生，但不值得为此报错。
 */
export function displayName(profile: {
  nickname?: string | null | undefined;
  username?: string | null | undefined;
}): string {
  return profile.nickname?.trim() || profile.username?.trim() || "当前账号";
}

/**
 * 已登录用户的账号回显。
 *
 * 为什么值得单独一个组件：**让用户在点「授权」之前看清是哪个账号**。CLI 拿到的令牌
 * 就是这个账号的，显示错了等于把凭据发给了错误的身份。因此这里不在加载态就渲染按钮。
 */
export function AccountBadge() {
  const { data, isPending, isError } = useMe();

  if (isPending) {
    return <p className="text-footnote text-label-secondary">正在读取当前账号…</p>;
  }
  if (isError || !data) {
    /* Q-02 给 D-15 的错误文案：刷新是这个页面上唯一有效的动作（重新登录也读不到） */
    return (
      <p className="text-footnote text-danger" role="alert">
        无法读取当前账号，请刷新页面重试。
      </p>
    );
  }

  return (
    /*
     * D-15 图例 3：**账号标签在卡片内上方**（一行 14 高的小字），下面是 40 高的
     * 账号框（头像 + 昵称 16 SemiBold + @用户名 13）。
     * 原实现把「将以以下账号授权」塞进那个框里当第一行，于是框内变成
     * "标签 / 昵称 / @用户名" 三行，与画板的"标签在外、框内两行"不符。
     */
    <div className="space-y-1.5">
      <p className="text-xs text-label-secondary">将以以下账号授权</p>
      <div className="flex items-center gap-2.5 rounded-lg border border-separator p-2.5">
        {/*
          头像用昵称首字兜底（与侧栏页脚、设置页同一套逻辑）：后端 avatar 可能为空，
          而这一屏的意义就是"点授权前看清是哪个账号"，缺了头像会削弱这层确认。
        */}
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-footnote font-medium text-white"
        >
          {displayName(data).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-semibold text-label">{displayName(data)}</p>
          {data.username ? (
            <p className="truncate text-footnote text-label-tertiary">@{data.username}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
