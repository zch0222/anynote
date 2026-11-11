"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Editor } from "@tiptap/react";
import { useState } from "react";

export type LinkInputResult = { ok: true; href: string } | { ok: false; error: string };

/**
 * 链接输入的解析与校验（桌面与移动端共用一套规则）。
 *
 * 走查 E-05：两端此前都用原生 `window.prompt`——与应用对话框 / 动作表视觉断裂，
 * 也无法做行内校验、没有「移除链接」。规则放在这里，两端只需要渲染同一份表单。
 *
 * 口径：
 * - 空串 = 移除链接（调用方据此 `unsetLink`）；
 * - 站内相对地址（`#` 开头、`/` 开头）原样接受；
 * - `http(s)` / `mailto` / `tel` 必须是完整形状；裸域名自动补 `https://`；
 * - 其它协议（`javascript:`、`data:` 等）与带空格的地址一律拒绝，`setLink` 不会执行。
 */
export function resolveLinkInput(raw: string): LinkInputResult {
  const value = raw.trim();
  if (value === "") {
    return { ok: true, href: "" };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: "链接地址不能包含空格" };
  }
  if (value.startsWith("#") || value.startsWith("/")) {
    return { ok: true, href: value };
  }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) {
    const scheme = value.slice(0, value.indexOf(":")).toLowerCase();
    if (scheme === "mailto" || scheme === "tel") {
      return value.length > scheme.length + 1
        ? { ok: true, href: value }
        : { ok: false, error: `请补全 ${scheme}: 后面的地址` };
    }
    const rest = value.replace(/^https?:\/\//i, "");
    if (rest === "" || rest.startsWith("/") || rest.startsWith("?")) {
      return { ok: false, error: "链接地址缺少域名" };
    }
    return { ok: true, href: value };
  }
  // 裸域名（example.com、example.com/path）：补上 https:// 才能被 ProseMirror 识别成链接
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(?::\d+)?(?:\/|$)/i.test(value)) {
    return { ok: true, href: `https://${value}` };
  }
  return { ok: false, error: "请输入 http:// 或 https:// 开头的完整地址" };
}

/**
 * 把一次链接编辑写回编辑器：`href` 为空表示移除链接。
 *
 * 两端共用这一个实现，避免再次出现「桌面改了、移动端还调 prompt」的漂移。
 */
export function applyLinkHref(editor: Editor, href: string) {
  const chain = editor.chain().focus().extendMarkRange("link");
  if (href === "") {
    chain.unsetLink().run();
    return;
  }
  chain.setLink({ href }).run();
}

export type LinkEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
  /** 打开时的初始地址：调用方在点击那一刻取，避免选择变化后读到别的链接。 */
  initialHref?: string | null;
  /** 桌面用 Dialog、移动端用底部 Sheet（与工具栏同一形态语言）。 */
  variant?: "dialog" | "sheet";
};

function LinkForm({
  initialHref,
  onApply,
  onCancel,
  idPrefix,
  autoFocus = false,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
  idPrefix: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initialHref);
  const [error, setError] = useState<string | null>(null);
  const hasLink = initialHref !== "";

  function submit() {
    const result = resolveLinkInput(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onApply(result.href);
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="text-xs text-label-secondary" htmlFor={`${idPrefix}-input`}>
        链接地址
      </label>
      <Input
        id={`${idPrefix}-input`}
        value={value}
        placeholder="https://example.com"
        autoFocus={autoFocus}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${idPrefix}-error`}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {error === null ? (
        <p className="text-xs text-label-tertiary">
          留空保存即移除链接；粘贴域名时会自动补上 https://
        </p>
      ) : (
        <p id={`${idPrefix}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        {hasLink ? (
          <Button type="button" variant="ghost" onClick={() => onApply("")}>
            移除链接
          </Button>
        ) : null}
        <Button type="submit">保存</Button>
      </div>
    </form>
  );
}

/**
 * 链接编辑弹层。
 *
 * 取代 `window.prompt`（走查 E-05）：原生弹窗在深色下是系统灰、无法上色、
 * 不能做行内校验，也没有「移除链接」这个明确动作。
 */
export function LinkEditor({
  open,
  onOpenChange,
  editor,
  initialHref = "",
  variant = "dialog",
}: LinkEditorProps) {
  const initial = initialHref ?? "";

  function close() {
    onOpenChange(false);
  }

  function apply(href: string) {
    applyLinkHref(editor, href);
    close();
  }

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
          data-testid="link-editor"
        >
          <SheetHeader>
            <SheetTitle>编辑链接</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <LinkForm
              initialHref={initial}
              onApply={apply}
              onCancel={close}
              idPrefix="mobile-link"
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="link-editor">
        <DialogHeader>
          <DialogTitle>编辑链接</DialogTitle>
        </DialogHeader>
        <LinkForm
          initialHref={initial}
          onApply={apply}
          onCancel={close}
          idPrefix="link"
          autoFocus
        />
      </DialogContent>
    </Dialog>
  );
}
