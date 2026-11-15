"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/api/errors";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	type EmbeddingFormValue,
	type EmbeddingModelConfig,
	type ModelProvider,
	toEmbeddingForm,
	validateEmbeddingForm,
} from "../schemas";
import {
	useEmbeddingConfigQuery,
	useUpdateEmbeddingConfigMutation,
} from "../use-model-providers";

const SELECT_CLASS =
	"h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-label outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 向量索引（Embedding）运行时配置卡片。
 */
export function EmbeddingModelSettings({
	providers,
}: {
	providers: ModelProvider[];
}) {
	const embedding = useEmbeddingConfigQuery();

	return (
		<Card data-testid="embedding-model-settings">
			<CardHeader className="border-b border-separator/60">
				<CardTitle>向量索引模型（Embedding）</CardTitle>
				<CardDescription>
					配置知识库索引向量化使用的模型、维度与开关；变更模型或维度后需执行索引重建生效。
				</CardDescription>
			</CardHeader>
			<CardContent>
				{embedding.isPending ? (
					<PanelSkeleton className="h-36" />
				) : embedding.isError ? (
					<QueryError
						object="向量索引模型配置"
						error={embedding.error}
						onRetry={() => void embedding.refetch()}
						retrying={embedding.isFetching}
					/>
				) : (
					<EmbeddingConfigForm
						key={`${embedding.data.version ?? 0}:${embedding.data.updateTime ?? ""}`}
						initial={embedding.data}
						providers={providers}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function EmbeddingConfigForm({
	initial,
	providers,
}: {
	initial: EmbeddingModelConfig;
	providers: ModelProvider[];
}) {
	const [form, setForm] = useState<EmbeddingFormValue>(() =>
		toEmbeddingForm(initial),
	);
	const [error, setError] = useState<string | null>(null);
	const update = useUpdateEmbeddingConfigMutation();

	const set = <K extends keyof EmbeddingFormValue>(
		key: K,
		value: EmbeddingFormValue[K],
	) => {
		setError(null);
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const selectedProvider = providers.find(
		(item) => item.providerKey === form.providerKey.trim(),
	);
	const providerModels = selectedProvider?.models ?? [];
	const hasUnlistedSavedProvider =
		Boolean(form.providerKey) && !selectedProvider;

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const invalid = validateEmbeddingForm(form, providers);
		if (invalid) {
			setError(invalid);
			return;
		}
		try {
			await update.mutateAsync(form);
			toast.success("Embedding 模型配置已保存");
		} catch (err) {
			setError(toUserMessage(err));
		}
	};

	return (
		<form
			onSubmit={(event) => void handleSubmit(event)}
			className="space-y-4"
			noValidate
		>
			<label className="flex min-h-8 items-center gap-2 text-footnote text-label">
				<input
					type="checkbox"
					checked={form.enabled}
					onChange={(event) => set("enabled", event.target.checked)}
					className="size-4 accent-accent"
					data-testid="embedding-enabled-input"
					aria-describedby="embedding-toggle-description"
				/>
				启用向量索引
			</label>
			<p
				id="embedding-toggle-description"
				className="text-footnote text-label-secondary"
			>
				关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。
			</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="embedding-provider">模型供应商</Label>
					<select
						id="embedding-provider"
						value={form.providerKey}
						onChange={(event) => {
							const nextKey = event.target.value;
							const nextProvider = providers.find(
								(item) => item.providerKey === nextKey,
							);
							setError(null);
							setForm((prev) => ({
								...prev,
								providerKey: nextKey,
								model:
									nextProvider &&
									prev.model === "" &&
									nextProvider.models.length > 0
										? (nextProvider.models[0] ?? "")
										: prev.model,
							}));
						}}
						className={SELECT_CLASS}
						data-testid="embedding-provider-select"
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

				<div className="space-y-1.5">
					<Label htmlFor="embedding-dimensions">
						向量维度（1–2048，留空自动探测）
					</Label>
					<Input
						id="embedding-dimensions"
						value={form.dimensions}
						onChange={(event) => set("dimensions", event.target.value)}
						inputMode="numeric"
						placeholder="留空自动探测"
						data-testid="embedding-dimensions-input"
					/>
				</div>

				<div className="space-y-1.5 sm:col-span-2">
					<Label htmlFor="embedding-model">Embedding 模型</Label>
					<div className="grid gap-2 sm:grid-cols-2">
						{providerModels.length > 0 ? (
							<select
								aria-label="选择模型"
								value={
									providerModels.includes(form.model) ? form.model : "__custom__"
								}
								onChange={(event) => {
									const value = event.target.value;
									if (value !== "__custom__") {
										set("model", value);
									}
								}}
								className={SELECT_CLASS}
								data-testid="embedding-model-select"
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
							id="embedding-model"
							value={form.model}
							onChange={(event) => set("model", event.target.value)}
							placeholder="例如 text-embedding-3-small"
							className={providerModels.length > 0 ? "" : "sm:col-span-2"}
							data-testid="embedding-model-input"
						/>
					</div>
				</div>
			</div>

			{selectedProvider && !selectedProvider.dataEgressAllowed ? (
				<output
					className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-footnote text-warning"
					data-testid="embedding-egress-warning"
				>
					<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					<span>所选供应商未允许数据出境，无法用于知识向量索引</span>
				</output>
			) : null}

			{error ? (
				<p
					role="alert"
					className="text-footnote text-danger"
					data-testid="embedding-error"
				>
					{error}
				</p>
			) : null}

			<div className="flex justify-end">
				<Button
					type="submit"
					disabled={update.isPending}
					data-testid="embedding-save"
				>
					{update.isPending ? "保存中…" : "保存配置"}
				</Button>
			</div>
		</form>
	);
}
