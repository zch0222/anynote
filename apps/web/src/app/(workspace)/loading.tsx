import { BrandBoot } from "@/components/layout/brand-boot";

/**
 * 路由级启动态（`(workspace)` 段）。
 *
 * Next 在没有更近的 `loading.tsx` 时用它兜住整段的挂载等待。
 * **刻意只放品牌启动，不放具体形状的骨架**：这一层拿不到子路由的参数
 * （是列表还是编辑器、是哪个知识库），猜一个形状出来等真内容到达时必然二次跳动。
 * 具体形状由各子路由自己的 `loading.tsx` 负责（`skeletonAfterMs=0` 关闭骨架兜底，
 * 因为整段初始化本来就慢，再叠一层骨架只会更晚看到品牌）。
 */
export default function WorkspaceLoading() {
  return <BrandBoot skeletonAfterMs={0} />;
}
