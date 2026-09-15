"use client";

import { EmptyState } from "@/components/shared/states";
import { Plug } from "lucide-react";

/**
 * 集成设置（D-13 图例 7）。
 *
 * 空态文案**不点名具体服务**：旧文案写「文件存储（MinIO / 华为 OBS）与 AI 服务
 * 已在后台配置」，那是写给部署者看的——用户既不需要知道用的是哪个对象存储，
 * 也不该从界面上读出部署形态。这里只说"由管理员配置、你无需操作"。
 */
export function IntegrationsSettings() {
  return (
    <div className="max-w-2xl space-y-4" data-testid="settings-integrations">
      <div>
        <h2 className="text-headline text-label">集成</h2>
        <p className="text-footnote text-label-tertiary">连接第三方服务，扩展 Anynote 的能力。</p>
      </div>
      <EmptyState
        icon={Plug}
        title="暂无可用的集成"
        hint="文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。"
      />
    </div>
  );
}
