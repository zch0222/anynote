"use client";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

export type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** 图标按钮出现在输入框内右侧还是外挂（表单里统一用内联）。 */
  className?: string;
};

/**
 * 密码输入框（D-12 `a-pwd` · D-14 `l-pwd`）。
 *
 * 设计稿把显示 / 隐藏在输入框**内右侧**，所以用 `InputGroup` 而不是给 `Input`
 * 加 padding——后者的按钮会跟着输入框一起被 `disabled` 的样式影响，
 * 且 `h-8` 下容易把文字挤到按钮下面。
 *
 * 三个不能省的细节：
 * 1. **`aria-pressed` 与 `aria-label` 同时给**：读屏要能听出当前是明文还是密文，
 *    只改 `aria-label`（"显示密码" / "隐藏密码"）在部分读屏里不会重播。
 * 2. **切换 `type` 不重挂组件**：用受控的本地 state 改 `type` 属性，
 *    焦点与光标位置因此原样保留；换成条件渲染两个 `<input>` 会丢光标。
 * 3. 图标按钮 `tabIndex={-1}`？**不行**——键盘用户同样需要它，
 *    所以留在 tab 序列里，只是不抢输入框的初始焦点。
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <InputGroup className={cn("h-10", className)}>
      <InputGroupInput
        id={props.id ?? id}
        type={visible ? "text" : "password"}
        data-slot="password-input"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <button
          type="button"
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          data-slot="password-input-toggle"
          onClick={() => setVisible((value) => !value)}
          className="inline-flex size-6 items-center justify-center rounded-full text-label-secondary outline-none transition-colors hover:text-label focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </InputGroupAddon>
    </InputGroup>
  );
}
