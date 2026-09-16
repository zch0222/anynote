import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        /*
         * **深色下不要填充**（D-14 图例实测）：画板里输入框与卡片同底
         * （`rgb(28,28,30)`），只有 1px 边框。早先这里有 `dark:bg-fill-hover`，
         * 在深色卡片上叠出 `rgb(44,44,45)` 的一层浅灰——浅色模式下看不出差别
         * （两边都是纯白），深色下是一眼可见的"输入框被填了一块"。
         * 禁用态仍保留填充：那时它是"不可编辑"的唯一视觉信号。
         */
        "h-8 w-full min-w-0 rounded-md border border-separator bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-label placeholder:text-label-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-fill-hover disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 md:text-sm dark:disabled:bg-fill-hover dark:aria-invalid:border-danger/50 dark:aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
