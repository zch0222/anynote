import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // 圆角与高度按设计规范：按钮全圆（pill），最小高度 32、主按钮 36。
  // 触摸下限 44 由移动端单独补（见 styles/mobile.css），桌面不强行放大。
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-footnote font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // 主按钮：一屏只留一个强调色（设计规范 §一）
        default: "bg-accent text-white [a]:hover:bg-accent/85",
        outline:
          "border-separator bg-surface text-label hover:bg-grouped aria-expanded:bg-grouped",
        secondary: "bg-grouped text-label hover:bg-grouped/70 aria-expanded:bg-grouped",
        ghost: "text-label-secondary hover:bg-grouped hover:text-label aria-expanded:bg-grouped",
        destructive: "bg-danger/10 text-danger hover:bg-danger/20 focus-visible:ring-danger/25",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 text-body",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
