"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth/use-logout-mutation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * 桌面设置页的退出登录卡片。
 *
 * @author 称霸幼儿园
 */
export function LogoutSettingsCard() {
  const logout = useLogoutMutation();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  /**
   * 执行退出登录，并在失败时恢复可重试状态。
   *
   * @author 称霸幼儿园
   */
  const handleConfirmLogout = () => {
    logout.mutate(undefined, {
      onError: () => {
        setConfirmingLogout(false);
        toast.error("退出登录失败，请重试");
      },
    });
  };

  return (
    <>
      <section
        className="overflow-hidden rounded-lg bg-surface shadow-card"
        data-testid="settings-logout"
      >
        <div className="flex items-center justify-end px-5 py-3">
          <Button
            type="button"
            variant="destructive"
            disabled={logout.isPending}
            onClick={() => setConfirmingLogout(true)}
            data-testid="settings-logout-button"
          >
            <LogOut aria-hidden="true" />
            {logout.isPending ? "正在退出…" : "退出登录"}
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmingLogout}
        onOpenChange={setConfirmingLogout}
        title="退出登录？"
        description="退出后需要重新输入账号密码，未保存的内容会丢失。"
        confirmLabel="退出登录"
        pendingLabel="正在退出…"
        tone="danger"
        pending={logout.isPending}
        onConfirm={handleConfirmLogout}
      />
    </>
  );
}
