"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AIModelValue,
  AI_MODEL_OPTIONS,
  loadPreferredModel,
  savePreferredModel,
} from "@/features/ai/model-options";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useMyProfileQuery,
  useResetPasswordMutation,
  useUpdateProfileMutation,
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

export function AccountSettings() {
  const profile = useMyProfileQuery();
  const update = useUpdateProfileMutation();
  const resetPassword = useResetPasswordMutation();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sex, setSex] = useState<number | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setPassword] = useState("");
  const hydrate = profile.data;

  useEffect(() => {
    if (!hydrate) {
      return;
    }
    setNickname(hydrate.nickname ?? "");
    setEmail(hydrate.email ?? "");
    setPhoneNumber(hydrate.phoneNumber ?? "");
    setSex(hydrate.sex ?? null);
  }, [hydrate]);

  const handleSaveProfile = async () => {
    if (!profile.data) {
      return;
    }
    try {
      await update.mutateAsync({
        profile: {
          ...profile.data,
          nickname: nickname.trim(),
          email: email.trim(),
          phoneNumber: phoneNumber.trim(),
          sex,
        },
      });
      toast.success("资料已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请稍后重试");
    }
  };

  const handleChangePassword = async () => {
    const parsed = validateResetPassword({ oldPassword, newPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "输入不合法");
      return;
    }
    try {
      await resetPassword.mutateAsync(parsed.data);
      toast.success("密码已修改");
      setOldPassword("");
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败，请稍后重试");
    }
  };

  return (
    <div className="max-w-2xl space-y-10">
      <section className="space-y-4" data-testid="settings-account">
        <div>
          <h2 className="text-lg font-semibold">账号资料</h2>
          <p className="text-sm text-muted-foreground">
            用户名 {profile.data?.username ?? "…"}（不可修改）
          </p>
        </div>
        {profile.isPending ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : profile.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            资料加载失败：{profile.error.message}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-nickname">昵称</Label>
              <Input
                id="settings-nickname"
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                }}
                maxLength={30}
                data-testid="settings-nickname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-sex">性别</Label>
              <select
                id="settings-sex"
                value={sex ?? ""}
                onChange={(event) => {
                  setSex(event.target.value === "" ? null : Number(event.target.value));
                }}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="settings-sex"
              >
                <option value="">未设置</option>
                <option value="0">男</option>
                <option value="1">女</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">邮箱</Label>
              <Input
                id="settings-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                data-testid="settings-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-phone">手机号</Label>
              <Input
                id="settings-phone"
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(event.target.value);
                }}
                data-testid="settings-phone"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={() => void handleSaveProfile()}
                disabled={update.isPending}
                data-testid="settings-save-profile"
              >
                {update.isPending ? "保存中…" : "保存资料"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4" data-testid="settings-password">
        <div>
          <h2 className="text-lg font-semibold">修改密码</h2>
          <p className="text-sm text-muted-foreground">8-15 位，需包含大小写字母和数字。</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-old-password">原密码</Label>
            <Input
              id="settings-old-password"
              type="password"
              value={oldPassword}
              onChange={(event) => {
                setOldPassword(event.target.value);
              }}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-new-password">新密码</Label>
            <Input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete="new-password"
              data-testid="settings-new-password"
            />
          </div>
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
