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

export type SettingsSection = "profile" | "appearance" | "ai" | "integrations";

/** 设置子导航（嵌套路由 /settings/<section>）。 */
export const SETTINGS_SECTIONS: { key: SettingsSection; label: string }[] = [
  { key: "profile", label: "账号" },
  { key: "appearance", label: "外观" },
  { key: "ai", label: "AI" },
  { key: "integrations", label: "集成" },
];

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
    <div className="max-w-2xl space-y-10">
      <section className="space-y-4" data-testid="settings-account">
        <div className="space-y-1">
          <h2 className="text-headline text-label">账号资料</h2>
          {/* D-12 图例 11：锁图标 + 一行说明；用户名不进表单，它不是可编辑字段 */}
          <p className="flex items-center gap-1 text-footnote text-label-tertiary">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            用户名 {server?.username ?? "…"} · 不可修改
          </p>
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
              <Input
                id="settings-nickname"
                className="h-8 rounded-md"
                value={form.nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                onChange={(event) => {
                  setForm((current) => ({ ...current, nickname: event.target.value }));
                }}
                data-testid="settings-nickname"
              />
              {/* D-12 图例 13：`N / 30`，让用户知道还剩多少字可写 */}
              <p className="text-right text-xs text-label-tertiary" data-testid="nickname-count">
                {form.nickname.length} / {NICKNAME_MAX_LENGTH}
              </p>
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
                        : (SEX_OPTIONS.find((option) => option.value === value)?.label ?? "未设置")
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
            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              {/* D-12 图例 17：一致时整段隐藏，且保存按钮禁用 */}
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
          </div>
        )}
      </section>

      <section className="space-y-4" data-testid="settings-password">
        <div className="space-y-1">
          <h2 className="text-headline text-label">修改密码</h2>
          <p className="text-footnote text-label-tertiary">改完需要用新密码重新登录其它设备。</p>
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
          {/* D-12 图例 24：规则清单随输入实时打勾，取代"提交后弹 toast" */}
          <ul className="space-y-1 sm:col-span-2" data-testid="settings-password-rules">
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
          <div className="sm:col-span-2">
            <Button
              variant="outline"
              onClick={() => void handleChangePassword()}
              disabled={resetPassword.isPending}
              data-testid="settings-change-password"
            >
              {resetPassword.isPending ? "提交中…" : "修改密码"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
