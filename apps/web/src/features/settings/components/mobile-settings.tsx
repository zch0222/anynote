"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { PasswordInput } from "@/components/shared/password-input";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  MOBILE_SETTINGS_SECTIONS,
  type MobileSettingsSection,
} from "@/features/settings/components/mobile/settings-sections";
import {
  type Profile,
  useMyProfileQuery,
  useResetPasswordMutation,
  useUpdateProfileMutation,
  validateResetPassword,
} from "@/features/settings/use-profile";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Monitor, Moon, Plug, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** `sys_user.sex` 的取值：0 男 / 1 女 / 2 未设置（B-3 契约）。 */
const SEX_UNSET = 2;

const SEX_OPTIONS = [
  { value: SEX_UNSET, label: "未设置" },
  { value: 0, label: "男" },
  { value: 1, label: "女" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun, swatch: "bg-[#f2f2f7]" },
  { value: "dark", label: "深色", icon: Moon, swatch: "bg-[#1c1c1e]" },
  {
    value: "system",
    label: "跟随系统",
    icon: Monitor,
    swatch: "bg-gradient-to-br from-[#f2f2f7] to-[#1c1c1e]",
  },
] as const;

/** 密码规则清单（与 `validateResetPassword` 的 schema 逐条对应）。 */
const PASSWORD_RULES = [
  { label: "8–15 位", test: (value: string) => value.length >= 8 && value.length <= 15 },
  { label: "含大写字母", test: (value: string) => /[A-Z]/.test(value) },
  { label: "含小写字母", test: (value: string) => /[a-z]/.test(value) },
  { label: "含数字", test: (value: string) => /[0-9]/.test(value) },
] as const;

/** 表单的本地状态：与服务端值同形，便于逐字段比对 dirty。 */
type ProfileForm = {
  nickname: string;
  sex: number;
  email: string;
  phoneNumber: string;
};

function toForm(profile: Profile | undefined): ProfileForm {
  return {
    nickname: profile?.nickname ?? "",
    sex: profile?.sex ?? SEX_UNSET,
    email: profile?.email ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  };
}

/**
 * `/m/settings/[section]`：设置子页（M-11）。
 *
 * 桌面把四个分区摊成横向 tabs；移动端拆成"我的 → 分区"两级，**版式不再复用
 * 桌面组件**：桌面的两列表单在 375 宽下会堆成一长列"标签 + 输入框"，
 * 一屏看不下四个字段。这里改成 iOS 设置式的行表单——标签左、值右、行高 52，
 * 选择类字段走动作表。
 *
 * 数据与校验与桌面同一套（`use-profile.ts` 的 hooks 与 schema），一行逻辑不重写。
 */
export function MobileSettingsPage({ section }: { section: MobileSettingsSection }) {
  const label = MOBILE_SETTINGS_SECTIONS.find((item) => item.key === section)?.label ?? "设置";

  return (
    <MobileScreen title={label} back="/m/me">
      <div className="p-4" data-testid={`mobile-settings-${section}`}>
        {section === "profile" ? <MobileAccountSettings /> : null}
        {section === "appearance" ? <MobileAppearanceSettings /> : null}
        {section === "ai" ? <MobileAiSettings /> : null}
        {section === "integrations" ? <MobileIntegrationsSettings /> : null}
      </div>
    </MobileScreen>
  );
}

/* ------------------------------------------------------------------ *
 * 账号（M-11 图例 6 – 13）
 * ------------------------------------------------------------------ */

function MobileAccountSettings() {
  const profile = useMyProfileQuery();
  const update = useUpdateProfileMutation();
  const resetPassword = useResetPasswordMutation();

  const [form, setForm] = useState<ProfileForm>(() => toForm(undefined));
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sexSheetOpen, setSexSheetOpen] = useState(false);

  const server = profile.data;
  useEffect(() => {
    if (!server) return;
    setForm(toForm(server));
  }, [server]);

  /**
   * dirty = 本地值 ≠ 服务端值。
   *
   * 逐字段比对而不是用 react-hook-form 的 `isDirty`：这里只有四个受控字段，
   * 而 `isDirty` 会把"改了又改回来"也算成脏——用户看到「有未保存的修改」
   * 却发现保存按钮点了没有任何变化，是比少一个提示更糟的状态。
   */
  const dirty = useMemo(() => {
    const base = toForm(server);
    return (
      base.nickname !== form.nickname.trim() ||
      base.sex !== form.sex ||
      base.email !== form.email.trim() ||
      base.phoneNumber !== form.phoneNumber.trim()
    );
  }, [form, server]);

  const handleSave = async () => {
    if (!server) return;
    const nickname = form.nickname.trim();
    if (!nickname) {
      toast.error("请填写昵称");
      return;
    }
    if (nickname.length > 30) {
      toast.error("昵称最多 30 个字符");
      return;
    }
    try {
      /*
       * 四个字段**全量提交**（B-3 契约：PUT 就是整体替换）。
       * 清空邮箱时传空串——后端把 "" 与 null 都当作清空，但空串与
       * `sys_user` 的列默认值一致，语义更明确。
       */
      await update.mutateAsync({
        profile: {
          ...server,
          nickname,
          sex: form.sex,
          email: form.email.trim(),
          phoneNumber: form.phoneNumber.trim(),
        },
      });
      toast.success("资料已更新");
    } catch (error) {
      // B-3 未上线时这里是 404 / 权限错误，如实显示后端原因
      toast.error(toUserMessage(error));
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
      setNewPassword("");
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  if (profile.isPending) {
    return <ListRowsSkeleton count={4} />;
  }
  if (profile.isError) {
    return (
      <QueryError
        object="资料"
        error={profile.error}
        onRetry={() => void profile.refetch()}
        retrying={profile.isFetching}
      />
    );
  }

  const sexLabel = SEX_OPTIONS.find((option) => option.value === form.sex)?.label ?? "未设置";

  return (
    <div className="space-y-6" data-testid="settings-account">
      <SettingsGroup label="账号资料">
        <SettingsInputRow
          label="昵称"
          value={form.nickname}
          onChange={(value) => setForm((current) => ({ ...current, nickname: value }))}
          maxLength={30}
          testId="settings-nickname"
        />
        <SettingsRow
          label="性别"
          value={sexLabel}
          onClick={() => setSexSheetOpen(true)}
          testId="settings-sex"
        />
        <SettingsInputRow
          label="邮箱"
          type="email"
          value={form.email}
          onChange={(value) => setForm((current) => ({ ...current, email: value }))}
          placeholder="未填写"
          testId="settings-email"
        />
        <SettingsInputRow
          label="手机号"
          type="tel"
          value={form.phoneNumber}
          onChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
          placeholder="未填写"
          testId="settings-phone"
        />
        <SettingsRow label="用户名" value={server?.username ?? "…"} disabled />
      </SettingsGroup>

      <div className="space-y-2">
        <p className="px-1 text-xs text-label-tertiary">
          {dirty ? "有未保存的修改" : "资料与服务器一致"}
        </p>
        <Button
          className="min-h-11 w-full"
          disabled={!dirty || update.isPending}
          onClick={() => void handleSave()}
          data-testid="settings-save-profile"
        >
          {update.isPending ? "保存中…" : "保存资料"}
        </Button>
      </div>

      <SettingsGroup label="修改密码">
        <div className="space-y-2 px-4 py-3">
          <PasswordInput
            aria-label="原密码"
            placeholder="原密码"
            className="rounded-md"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            data-testid="settings-old-password"
          />
          <PasswordInput
            aria-label="新密码"
            placeholder="新密码"
            className="rounded-md"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            data-testid="settings-new-password"
          />
          <ul className="space-y-1 pt-1" data-testid="settings-password-rules">
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
                    className={cn("size-3.5 shrink-0", passed ? "opacity-100" : "opacity-40")}
                    aria-hidden="true"
                  />
                  {rule.label}
                </li>
              );
            })}
          </ul>
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={resetPassword.isPending}
            onClick={() => void handleChangePassword()}
            data-testid="settings-change-password"
          >
            {resetPassword.isPending ? "修改中…" : "修改密码"}
          </Button>
        </div>
      </SettingsGroup>

      {sexSheetOpen ? (
        <MobileActionSheet
          open
          onOpenChange={setSexSheetOpen}
          title="性别"
          actions={SEX_OPTIONS.map((option) => ({
            label: option.value === form.sex ? `${option.label} ✓` : option.label,
            onSelect: () => setForm((current) => ({ ...current, sex: option.value })),
          }))}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 外观（M-11 图例 16）
 * ------------------------------------------------------------------ */

function MobileAppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-3" data-testid="settings-appearance">
      <SettingsGroup label="主题">
        {THEME_OPTIONS.map(({ value, label, swatch }) => {
          const active = theme === value;
          return (
            <li key={value}>
              <button
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: 主题是同一件事的三选一，用 button + role=radio 才能与桌面 AppearanceSettings 保持同一套键盘行为
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(value)}
                data-testid={`theme-option-${value}`}
                className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left text-base text-label outline-none transition-colors focus-visible:bg-fill-hover"
              >
                {/* 图例 16：色块 28，浅 / 深 / 渐变三态一眼分得出来 */}
                <span
                  aria-hidden="true"
                  className={cn("size-7 shrink-0 rounded-lg border border-separator", swatch)}
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {active ? (
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </SettingsGroup>
      <p className="px-1 text-xs text-label-tertiary">
        主题立即生效，无需保存；偏好只保存在这台设备的浏览器里。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * AI / 集成（M-11 图例 19 – 20）
 * ------------------------------------------------------------------ */

/**
 * AI 分节在移动端**只保留入口**。
 *
 * 桌面那一版是模型偏好的胶囊按钮；移动端本轮不出稿（§1.2），
 * 版式不动、内容也不改版，只把入口留在这一层。
 */
function MobileAiSettings() {
  return (
    <div className="space-y-3" data-testid="settings-ai">
      <SettingsGroup label="AI">
        <li className="px-4 py-3">
          <p className="text-base text-label">AI 对话</p>
          <p className="mt-1 text-footnote text-label-secondary">
            入口保留，AI 相关页面暂时沿用现有版式。
          </p>
        </li>
      </SettingsGroup>
    </div>
  );
}

function MobileIntegrationsSettings() {
  return (
    <div className="space-y-3" data-testid="settings-integrations">
      <SettingsGroup label="集成">
        <li className="px-4 py-6 text-center">
          <Plug className="mx-auto size-7 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-[0.9375rem] font-semibold text-label">暂无可用的集成</p>
          <p className="mt-1 text-footnote text-label-secondary">
            文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。
          </p>
        </li>
      </SettingsGroup>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 行表单原子
 * ------------------------------------------------------------------ */

/** 一行一组的分组容器：标签 + 一个带分隔线的圆角列表（iOS 设置的分组形态）。 */
function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-medium text-label-tertiary">{label}</h2>
      <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface">
        {children}
      </ul>
    </section>
  );
}

/**
 * 输入行：标签 64 宽左对齐，输入框占满右侧，行高 52。
 *
 * 输入框本身**不加描边**（聚焦只有光标）：iOS 设置里同一屏会有四五个输入行，
 * 每行一个描边框会把整页切成一堆小方块，反而看不出分组。
 */
function SettingsInputRow({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  testId?: string;
}) {
  return (
    <li className="flex min-h-13 items-center gap-3 px-4 py-2">
      <span className="w-16 shrink-0 text-base text-label">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-right text-base text-label outline-none placeholder:text-label-tertiary"
      />
    </li>
  );
}

/** 选择行：值在右、跟一个 ›；点了打开动作表。 */
function SettingsRow({
  label,
  value,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  if (disabled || !onClick) {
    return (
      <li className="flex min-h-13 items-center gap-3 px-4 py-2">
        <span className="w-16 shrink-0 text-base text-label">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-base text-label-tertiary">
          {value}
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left outline-none transition-colors focus-visible:bg-fill-hover"
      >
        <span className="w-16 shrink-0 text-base text-label">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-base text-label-secondary">
          {value}
        </span>
        <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      </button>
    </li>
  );
}
