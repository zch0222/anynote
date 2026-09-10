"use client";

/** 集成设置：当前版本没有可连接的第三方服务，说明页占位。 */
export function IntegrationsSettings() {
  return (
    <div className="max-w-2xl space-y-4" data-testid="settings-integrations">
      <div>
        <h2 className="text-lg font-semibold">集成</h2>
        <p className="text-sm text-muted-foreground">连接第三方服务，扩展 Anynote 的能力。</p>
      </div>
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">暂无可用的集成</p>
        <p className="mt-1 text-sm text-muted-foreground">
          文件存储（MinIO / 华为 OBS）与 AI 服务已在后台配置，无需在此连接。
        </p>
      </div>
    </div>
  );
}
