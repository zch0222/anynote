"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as NonNullable<ToasterProps["theme"]>}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // sonner 这套 CSS 变量名是它自己的契约，右边必须是**本设计系统真实存在**的
          // Token：早先写的是 shadcn v3 的 --popover / --border / --radius，
          // 而它们在本仓从未定义过，var() 解析失败会让 sonner 拿不到底色与圆角。
          "--normal-bg": "var(--surface-elevated)",
          "--normal-text": "var(--label-primary)",
          "--normal-border": "var(--separator)",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
