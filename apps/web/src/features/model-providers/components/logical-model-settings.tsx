"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/api/errors";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  LOGICAL_MODEL_CARDS,
  type LogicalFormValue,
  type LogicalModelConfig,
  type ModelProvider,
  toLogicalForm,
  validateLogicalForm,
} from "../schemas";
import { useLogicalConfigQuery, useUpdateLogicalConfigMutation } from "../use-model-providers";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-label outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const REASONING_FORMAT_OPTIONS: {
  value: LogicalFormValue["reasoningFormat"];
  label: string;
}[] = [
  { value: "none", label: "不输出" },
  { value: "reasoning_content", label: "reasoning_content 字段" },
  { value: "reasoning", label: "reasoning 字段" },
  { value: "think_tag", label: "正文 <think> 标签" },
];

const REASONING_PASSTHROUGH_OPTIONS: {
  value: LogicalFormValue["reasoningPassthrough"];
  label: string;
}[] = [
  { value: "none", label: "不回传" },
  { value: "empty", label: "回传空字段" },
  { value: "original", label: "原样回传" },
];

/**
 * 三张逻辑模型运行时配置卡片（主对话 / 历史压缩 / 向量索引），
 * 由 {@link LogicalModelSettings} 按用途名逐张渲染。
 *
 * @param logicalName 逻辑模型用途名（agent_main、fast、embedding）
 * @param providers 模型供应商列表
 *
 * @author 称霸幼儿园
 */
export function LogicalModelCard({
  logicalName,
  providers,
}: {
  logicalName: string;
  providers: ModelProvider[];
}) {
  const card = LOGICAL_MODEL_CARDS.find((item) => item.logicalName === logicalName);
  const config = useLogicalConfigQuery(logicalName);
  if (!card) {
    return null;
  }

  return (
    <Card data-testid={`logical-model-settings-${logicalName}`}>
      <CardHeader className="border-b border-separator/60">
        <CardTitle>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {config.isPending ? (
          <PanelSkeleton className="h-36" />
        ) : config.isError ? (
          <QueryError
            object="逻辑模型配置"
            error={config.error}
            onRetry={() => void config.refetch()}
            retrying={config.isFetching}
          />
        ) : (
          <LogicalConfigForm
            key={`${logicalName}:${config.data?.version ?? 0}:${config.data?.updateTime ?? ""}`}
            logicalName={logicalName}
            initial={config.data}
            providers={providers}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LogicalConfigForm({
  logicalName,
  initial,
  providers,
}: {
  logicalName: string;
  initial: LogicalModelConfig | null | undefined;
  providers: ModelProvider[];
}) {
  const card = LOGICAL_MODEL_CARDS.find((item) => item.logicalName === logicalName);
  const isEmbedding = logicalName === "embedding";
  const [form, setForm] = useState<LogicalFormValue>(() => toLogicalForm(initial));
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateLogicalConfigMutation(logicalName);

  const set = <K extends keyof LogicalFormValue>(key: K, value: LogicalFormValue[K]) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedProvider = providers.find((item) => item.providerKey === form.providerKey.trim());
  const providerModels = selectedProvider?.models ?? [];
  const hasUnlistedSavedProvider = Boolean(form.providerKey) && !selectedProvider;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = validateLogicalForm(form, logicalName, providers);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      await update.mutateAsync(form);
      toast.success("模型配置已保存");
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
      <label className="flex min-h-8 items-center gap-2 text-footnote text-label">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => set("enabled", event.target.checked)}
          className="size-4 accent-accent"
          data-testid={`${logicalName}-enabled-input`}
          aria-describedby={`${logicalName}-toggle-description`}
        />
        {card?.toggleLabel}
      </label>
      <p id={`${logicalName}-toggle-description`} className="text-footnote text-label-secondary">
        {form.enabled
          ? isEmbedding
            ? "关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。"
            : "关闭后使用该模型的调用将不可用，新对话会启动失败。"
          : isEmbedding
            ? "关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。"
            : "关闭后使用该模型的调用将不可用，新对话会启动失败。"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${logicalName}-provider`}>模型供应商</Label>
          <select
            id={`${logicalName}-provider`}
            value={form.providerKey}
            onChange={(event) => {
              const nextKey = event.target.value;
              const nextProvider = providers.find((item) => item.providerKey === nextKey);
              setError(null);
              setForm((prev) => ({
                ...prev,
                providerKey: nextKey,
                model:
                  nextProvider && prev.model === "" && nextProvider.models.length > 0
                    ? (nextProvider.models[0] ?? "")
                    : prev.model,
              }));
            }}
            className={SELECT_CLASS}
            data-testid={`${logicalName}-provider-select`}
          >
            <option value="">请选择模型供应商</option>
            {hasUnlistedSavedProvider ? (
              <option value={form.providerKey}>{form.providerKey}</option>
            ) : null}
            {providers.map((provider) => (
              <option key={provider.providerKey} value={provider.providerKey}>
                {provider.displayName}（{provider.providerKey}）
                {provider.enabled ? "" : " - 已停用"}
              </option>
            ))}
          </select>
        </div>

        {isEmbedding ? (
          <div className="space-y-1.5">
            <Label htmlFor="embedding-dimensions">向量维度（1–2048，留空自动探测）</Label>
            <Input
              id="embedding-dimensions"
              value={form.dimensions}
              onChange={(event) => set("dimensions", event.target.value)}
              inputMode="numeric"
              placeholder="留空自动探测"
              data-testid="embedding-dimensions-input"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${logicalName}-reasoning-format`}>推理输出格式</Label>
            <select
              id={`${logicalName}-reasoning-format`}
              value={form.reasoningFormat}
              onChange={(event) =>
                set("reasoningFormat", event.target.value as LogicalFormValue["reasoningFormat"])
              }
              className={SELECT_CLASS}
              data-testid={`${logicalName}-reasoning-format-select`}
            >
              {REASONING_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${logicalName}-model`}>{isEmbedding ? "Embedding 模型" : "模型"}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {providerModels.length > 0 ? (
              <select
                aria-label="选择模型"
                value={providerModels.includes(form.model) ? form.model : "__custom__"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== "__custom__") {
                    set("model", value);
                  }
                }}
                className={SELECT_CLASS}
                data-testid={`${logicalName}-model-select`}
              >
                <option value="__custom__">手动输入或选择下方模型</option>
                {providerModels.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
            ) : null}
            <Input
              id={`${logicalName}-model`}
              value={form.model}
              onChange={(event) => set("model", event.target.value)}
              placeholder={isEmbedding ? "例如 text-embedding-3-small" : "例如 deepseek-chat"}
              className={providerModels.length > 0 ? "" : "sm:col-span-2"}
              data-testid={`${logicalName}-model-input`}
            />
          </div>
        </div>

        {!isEmbedding ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${logicalName}-reasoning-passthrough`}>推理回传方式</Label>
            <select
              id={`${logicalName}-reasoning-passthrough`}
              value={form.reasoningPassthrough}
              onChange={(event) =>
                set(
                  "reasoningPassthrough",
                  event.target.value as LogicalFormValue["reasoningPassthrough"],
                )
              }
              className={SELECT_CLASS}
              data-testid={`${logicalName}-reasoning-passthrough-select`}
            >
              {REASONING_PASSTHROUGH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {selectedProvider && !selectedProvider.dataEgressAllowed ? (
        <output
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-footnote text-warning"
          data-testid={`${logicalName}-egress-warning`}
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {isEmbedding
              ? "所选供应商未允许数据出境，无法用于知识向量索引"
              : "所选供应商未允许数据出境，无法用于知识对话"}
          </span>
        </output>
      ) : null}

      {error ? (
        <p role="alert" className="text-footnote text-danger" data-testid={`${logicalName}-error`}>
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending} data-testid={`${logicalName}-save`}>
          {update.isPending ? "保存中…" : "保存配置"}
        </Button>
      </div>
    </form>
  );
}
