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
    <div className="rounded-lg border bg-fill-hover/60 p-3">
      <p className="text-xs text-label-secondary">将以以下账号授权</p>
      <p className="mt-1 text-footnote font-medium text-label">{displayName(data)}</p>
      {data.username ? <p className="text-xs text-label-tertiary">@{data.username}</p> : null}
    </div>
  );
}
