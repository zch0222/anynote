import { MobileCreateNote } from "@/features/notes/components/mobile/create-note-mobile";
import { Suspense } from "react";

export default function Page() {
  // useSearchParams（?baseId= 预选）必须有 Suspense 边界，否则整页退化成动态渲染
  return (
    <Suspense>
      <MobileCreateNote />
    </Suspense>
  );
}
