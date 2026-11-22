"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { type RefObject, Suspense, lazy, useMemo } from "react";
import { getTabDefinition } from "./registry";
import type { TabBodyProps, TabRecord } from "./types";

/**
 * 活动标签的正文：按定义懒加载，切换标签时由 key 强制重挂载。
 *
 * @author 称霸幼儿园
 */

export function TabPanel({
  record,
  navigation,
  variant,
  actions,
  panelId,
  labelledBy,
  bodyRef,
}: {
  record: TabRecord;
  navigation: TabBodyProps["navigation"];
  variant: TabBodyProps["variant"];
  actions: TabBodyProps["actions"];
  panelId: string;
  labelledBy: string;
  bodyRef?: RefObject<HTMLDivElement | null>;
}) {
  const definition = getTabDefinition(record.kind);
  const Body = useMemo(() => lazy(definition.body), [definition]);

  return (
    <div
      ref={bodyRef}
      role="tabpanel"
      id={panelId}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className="min-h-0 flex-1 outline-none"
    >
      <Suspense fallback={<PanelSkeleton className="m-4" />}>
        <Body
          key={record.id}
          record={record}
          navigation={navigation}
          variant={variant}
          actions={actions}
        />
      </Suspense>
    </div>
  );
}
