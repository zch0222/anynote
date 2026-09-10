"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoutMutation } from "@/features/auth/use-logout-mutation";
import { useMe } from "@/features/auth/use-me";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function UserMenu() {
  const { data } = useMe();
  const logout = useLogoutMutation();
  const name = data?.nickname || data?.username || "我的账户";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="gap-2 px-2" />}
        aria-label="用户菜单"
        disabled={logout.isPending}
      >
        <Avatar size="sm">
          <AvatarImage src={data?.avatar || undefined} alt="" />
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">
          {logout.isPending ? "正在退出…" : name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
            <Settings />
            个人设置
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, { onError: () => toast.error("退出登录失败，请重试") })
          }
        >
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
