"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { PasswordInput } from "@/components/shared/password-input";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_RULES,
  SEX_OPTIONS,
  type UpdateMyProfileInput,
  isProfileDirty,
  toProfileForm,
  useMyProfileQuery,
  useResetPasswordMutation,
  useUpdateMyProfileMutation,
  validateResetPassword,
} from "../use-profile";

/*
 * 分节表已抽到 `@/features/settings/sections`（见那里的注释：留在本文件会把
 * react-hook-form 整棵树拖进每个引用它的页面首屏）。这里**再导出**，
 * 既有的 import 路径与测试不用改。
 */
export { SETTINGS_SECTIONS, type SettingsSection } from "@/features/settings/sections";

/**
 * 资料卡（D-12 图例 11 – 18）。
 *
 * 表单内部**只认 0 / 1 / 2 三态**（`SEX_UNSET` = 2 = 未设置）：数据库列是
 * `tinyint` 且注册时必填，从来没有过"空"这一态。旧实现用 `null` 表示未设置，
 * 保存时被 B-3 的 `@NotNull` 拒掉——所以 `null` 在进表单前就被收敛成 2。
 */
export function AccountSettings() {
  const profile = useMyProfileQuery();
  const update = useUpdateMyProfileMutation();
  const resetPassword = useResetPasswordMutation();

  const [form, setForm] = useState<UpdateMyProfileInput>(() => toProfileForm(undefined));
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  /**
   * 原密码字段下方的业务错误。
   *
   * 后端把「旧密码错误」和其它失败混在同一个 `msg` 通道里（`LoginServiceImpl:120`），
   * 只有这一种情况该落到字段上——其余（网络、限流）仍然走 toast，
   * 否则用户会盯着一个输入框找网络问题的原因。
   */
  const [oldPasswordError, setOldPasswordError] = useState<string | null>(null);

  const server = profile.data;

  useEffect(() => {
    if (!server) return;
    setForm(toProfileForm(server));
  }, [server]);

  const dirty = useMemo(() => isProfileDirty(form, server), [form, server]);

  const handleSaveProfile = async () => {
    if (!server) return;
    const nickname = form.nickname.trim();
    if (!nickname) {
      toast.error("请填写昵称");
      return;
    }
    try {
      /*
       * 四个字段**全量提交**（B-3 契约：PUT 就是整体替换）。
       * 清空邮箱时传空串——后端把 "" 与 null 都当清空，空串与 `sys_user` 列的
       * 默认值一致，语义更明确；旧实现在这里过滤空值，导致"清了保存不生效"。
       */
      await update.mutateAsync({
        nickname,
        sex: form.sex,
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });
      toast.success("资料已更新");
    } catch (error) {
      // B-3 上线前这里是 404 / 权限错误。toast 后端原因、**保留输入**，
      // 让用户可以原样重试而不是重新填一遍。
      toast.error(toUserMessage(error));
    }
  };

  const handleChangePassword = async () => {
    const parsed = validateResetPassword({ oldPassword, newPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "输入不合法");
      return;
    }
    setOldPasswordError(null);
    try {
      await resetPassword.mutateAsync(parsed.data);
      toast.success("密码已修改");
      setOldPassword("");
      setNewPassword("");
    } catch (error) {
      const message = toUserMessage(error);
      if (message.includes("旧密码")) {
        setOldPasswordError(message);
        return;
      }
      toast.error(message);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/*
        H-13：画板把「账号资料」画成**一张白卡**（实测内容区近白占比 71.4%，
        实现是 0.0%），卡片自带内边距与页脚。原实现是一个裸的 `space-y-4` 分区，
        内容直接铺在 `bg-grouped` 灰底上——卡片外壳整个缺失。
        这是 D-12 / D-13 / D-18 同一类回归（三处都是"画板有卡、实现没有"）。
      */}
      <section
        className="overflow-hidden rounded-lg bg-surface shadow-card"
        data-testid="settings-account"
      >
        <div className="space-y-4 p-5">
          {/*
            D-12 卡片头部：**40 头像 + 昵称**，其下一行 `🔒 用户名 xxx · 不可修改`。
            原实现只有标题「账号资料」+ 一行锁图标用户名，没有头像块——
            但这是画板明列的图例元素（附录 A D-12 表：「锁图标 + 一行说明」），
            不是风格偏好。头像与侧栏页脚用户卡用同一套 fallback 逻辑（首字）。
          */}
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-body font-medium text-white"
              data-testid="settings-avatar"
            >
              {(server?.nickname?.trim() || server?.username?.trim() || "用").slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-headline font-semibold text-label">
                {server?.nickname?.trim() || server?.username?.trim() || "…"}
              </p>
              {/* D-12 图例 11：锁图标 + 一行说明；用户名不进表单，它不是可编辑字段 */}
              <p className="flex items-center gap-1 text-footnote text-label-tertiary">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                用户名 {server?.username ?? "…"} · 不可修改
              </p>
            </div>
          </div>

          {profile.isPending ? (
            <PanelSkeleton className="h-48" />
          ) : profile.isError ? (
            /* Q-02 给 D-12 的口径：资料加载失败：{message} + 重试（图例 28） */
            <QueryError
              object="资料"
              error={profile.error}
              onRetry={() => void profile.refetch()}
              retrying={profile.isFetching}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-nickname">昵称</Label>
                {/*
                  D-12 图例 13：`2 / 30` 在输入框**内**右侧（图例原文如此）。
                  原来放在框下方右对齐，那一行会把昵称这一列撑高、
                  与右侧「性别」列错开一行——两列栅格从此不再对齐。
                */}
                <div className="relative">
                  <Input
                    id="settings-nickname"
                    className="h-8 rounded-md pr-14"
                    value={form.nickname}
                    maxLength={NICKNAME_MAX_LENGTH}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, nickname: event.target.value }));
                    }}
                    data-testid="settings-nickname"
                  />
                  <span
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-label-tertiary tabular-nums"
                    data-testid="nickname-count"
                  >
                    {form.nickname.length} / {NICKNAME_MAX_LENGTH}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-sex">性别</Label>
                {/*
                  用 Select 而不是原生 <select>：原生控件在深色下无法用语义 Token 上色，
                  高度与圆角也对不齐输入框（36/6 对 32/10）。`items` 让触发器直接显示
                  标签而不是裸的数值。
                */}
                <Select
                  items={SEX_OPTIONS}
                  value={form.sex}
                  onValueChange={(next) => {
                    setForm((current) => ({ ...current, sex: Number(next) }));
                  }}
                >
                  <SelectTrigger
                    id="settings-sex"
                    className="h-8 w-full rounded-md"
                    data-testid="settings-sex"
                  >
                    <SelectValue>
                      {/*
                        挡 null 再转数字：`Number(null)` 是 0（男），不挡的话
                        "未设置"会被显示成「男」，而表单里存的其实是 2。
                      */}
                      {(value: number | null) =>
                        value === null
                          ? "未设置"
                          : (SEX_OPTIONS.find((option) => option.value === value)?.label ??
                            "未设置")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SEX_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email">邮箱</Label>
                {/* D-12 图例 15：可清空——空串就是清空，不做"空值不提交"的过滤 */}
                <Input
                  id="settings-email"
                  type="email"
                  className="h-8 rounded-md"
                  value={form.email}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, email: event.target.value }));
                  }}
                  data-testid="settings-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-phone">手机号</Label>
                <Input
                  id="settings-phone"
                  type="tel"
                  className="h-8 rounded-md"
                  placeholder="用于找回账号（选填）"
                  value={form.phoneNumber}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, phoneNumber: event.target.value }));
                  }}
                  data-testid="settings-phone"
                />
              </div>
            </div>
          )}
        </div>

        {/*
          D-12 图例 17：卡片**页脚**放「有未保存的修改」+「保存资料」，上方一条 1px 分隔。
          原来这两样跟在字段网格里（`sm:col-span-2`），视觉上仍是表单的一部分，
          与画板的"卡内页脚"形态不符。
        */}
        <div className="flex items-center justify-end gap-3 border-t border-separator bg-fill-footer px-5 py-3">
          {dirty ? (
            <p className="text-footnote text-label-tertiary" data-testid="profile-dirty-hint">
              有未保存的修改
            </p>
          ) : null}
          <Button
            onClick={() => void handleSaveProfile()}
            disabled={!dirty || update.isPending}
            data-testid="settings-save-profile"
          >
            {update.isPending ? "保存中…" : "保存资料"}
          </Button>
        </div>
      </section>

      {/* 「修改密码」是**第二张白卡**（画板实测：两张卡各自独立、中间有间隙） */}
      <section
        className="overflow-hidden rounded-lg bg-surface shadow-card"
        data-testid="settings-password"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-headline text-label">修改密码</h2>
            {/* 画板实测原文：`8–15 位，需包含大小写字母和数字。` */}
            <p className="text-footnote text-label-tertiary">8–15 位，需包含大小写字母和数字。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-old-password">原密码</Label>
              <PasswordInput
                id="settings-old-password"
                value={oldPassword}
                onChange={(event) => {
                  setOldPassword(event.target.value);
                  setOldPasswordError(null);
                }}
                autoComplete="current-password"
                aria-invalid={oldPasswordError !== null}
                aria-describedby={oldPasswordError ? "settings-old-password-error" : undefined}
              />
              {oldPasswordError ? (
                <p
                  id="settings-old-password-error"
                  role="alert"
                  className="text-xs text-danger"
                  data-testid="settings-old-password-error"
                >
                  {oldPasswordError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-new-password">新密码</Label>
              <PasswordInput
                id="settings-new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                }}
                autoComplete="new-password"
                data-testid="settings-new-password"
              />
            </div>
            {/*
              D-12 图例 24：规则清单随输入实时打勾，取代"提交后弹 toast"。
              画板是**一行四项**（`⊘ 8–15 位 ⊘ 含大写字母 ⊘ 含小写字母 ⊘ 含数字`），
              原来是 `space-y-1` 的纵向四行——比画板高了三行，把卡片撑长。
              用 flex-wrap 而不是 grid-cols-4：窄屏下允许折行，宽屏下四项同行。
            */}
            <ul
              className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-2"
              data-testid="settings-password-rules"
            >
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(newPassword);
                return (
                  <li
                    key={rule.label}
                    data-passed={passed ? "true" : "false"}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      passed ? "text-success" : "text-label-tertiary",
                    )}
                  >
                    <Check
                      className={cn("size-3.5 shrink-0", passed ? "opacity-100" : "opacity-30")}
                      aria-hidden="true"
                    />
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* D-12 图例：页脚右对齐，与「账号资料」卡同一形态 */}
        <div className="flex items-center justify-end border-t border-separator bg-fill-footer px-5 py-3">
          <Button
            variant="outline"
            onClick={() => void handleChangePassword()}
            disabled={resetPassword.isPending}
            data-testid="settings-change-password"
          >
            {resetPassword.isPending ? "提交中…" : "修改密码"}
          </Button>
        </div>
      </section>
    </div>
  );
}
