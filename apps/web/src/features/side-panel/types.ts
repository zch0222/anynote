import type {
  ResourceHint,
  ResourceLocator,
  ResourceRef,
  ResourceTarget,
  ResourceType,
  ResourceVariant,
} from "@/lib/ai/resource-target";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/**
 * 右侧栏的标签记录、标签定义与正文属性。
 *
 * @author 称霸幼儿园
 */

export type SurfaceKey = string;

export type TabId = string & { readonly __brand: "SidePanelTabId" };

export type TabTitleHint = Pick<ResourceHint, "title">;

export type TabTitle = { title: string | null; unavailable: boolean };

export type TabRecord =
  | { id: TabId; kind: string; family: "resource"; ref: ResourceRef }
  | { id: TabId; kind: string; family: "page"; contentId: string };

export type TabNavigation = { locator: ResourceLocator; revision: number };

export type SurfaceState = {
  open: boolean;
  /** 最大化不持久化。 */
  maximized: boolean;
  /** 标签显示顺序。 */
  tabs: TabRecord[];
  activeId: TabId | null;
  /** 最近使用顺序：关闭后激活谁、超限淘汰谁。 */
  recent: TabId[];
  /** 标签 id 计数。 */
  seq: number;
  /** 定位与导航版本，不持久化。 */
  navigation: Record<string, TabNavigation>;
  /** 打开时随手带上的标题与知识库名，不持久化。 */
  hints: Record<string, ResourceHint>;
  touchedAt: number;
};

export type TabBodyActions = {
  /** 在同一侧栏打开别的资源。 */
  openResource: (target: ResourceTarget) => void;
  /** 关闭当前标签。 */
  close: () => void;
  /** 登记卸载守卫，返回注销函数。 */
  registerGuard: (guard: () => boolean) => () => void;
  /** 登记「在新窗口打开」处理器（笔记需要先保存），返回注销函数。 */
  registerNewWindow: (handler: ((href: string) => void) | null) => () => void;
};

export type TabBodyProps = {
  record: TabRecord;
  navigation: TabNavigation;
  variant: ResourceVariant;
  actions: TabBodyActions;
};

export type TabDefinition = {
  /** 全表唯一。 */
  kind: string;
  family: "resource" | "page";
  /** resource 类必填；每种资源类型恰好一个定义，且与 kind 相同。 */
  resourceType?: ResourceType;
  /** page 类：每次打开是否新建；调用方未显式传参时由定义决定。 */
  multiple?: boolean;
  /** 默认只挂载活动标签的正文；容器暂未消费该字段。 */
  keepMounted?: boolean;
  /** 默认：resource 为 true，page 为 false。 */
  persist?: boolean;
  /** false 时移动端仍整页跳转。 */
  mobile: boolean;
  icon: LucideIcon;
  /** 取不到标题时的兜底。 */
  typeLabel: string;
  /** 标签条上的标题；与正文共用查询缓存。 */
  useTitle: (record: TabRecord, hint?: TabTitleHint) => TabTitle;
  /** 完整页面地址；有值时标签头显示新窗口与打开完整页面。 */
  href?: (record: TabRecord, locator: ResourceLocator, variant: ResourceVariant) => string | null;
  /** 移动端「更多」菜单里的额外项（如笔记的历史版本）。 */
  moreMenu?: (
    record: TabRecord,
    locator: ResourceLocator,
    variant: ResourceVariant,
  ) => Array<{ label: string; href: string; newWindow?: boolean }>;
  body: () => Promise<{ default: ComponentType<TabBodyProps> }>;
};

/** 标签 id 的品牌化转换。 */
export function asTabId(value: string): TabId {
  return value as TabId;
}
