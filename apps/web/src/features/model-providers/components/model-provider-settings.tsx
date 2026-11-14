"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { PasswordInput } from "@/components/shared/password-input";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toUserMessage } from "@/lib/api/errors";
import { Plus, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	type ModelProvider,
	type ProviderFormValue,
	emptyProviderForm,
	toProviderForm,
	validateProviderForm,
} from "../schemas";
import {
	useCreateModelProviderMutation,
	useDeleteModelProviderMutation,
	useModelProvidersQuery,
	useUpdateModelProviderMutation,
} from "../use-model-providers";

export function ModelProviderSettings() {
	const providers = useModelProvidersQuery();
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<ModelProvider | null>(null);
	const [deleting, setDeleting] = useState<ModelProvider | null>(null);

	const openCreate = () => {
		setEditing(null);
		setFormOpen(true);
	};
	const openEdit = (provider: ModelProvider) => {
		setEditing(provider);
		setFormOpen(true);
	};

	return (
		<div className="space-y-5" data-testid="model-provider-settings">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-headline font-semibold text-label">模型供应商</h2>
					<p className="text-footnote text-label-secondary">
						管理 AI 模型供应商、接口地址与访问凭据。
					</p>
				</div>
				<Button onClick={openCreate} data-testid="provider-create">
					<Plus aria-hidden="true" />
					新增供应商
				</Button>
			</div>

			{providers.isPending ? (
				<PanelSkeleton className="h-56" />
			) : providers.isError ? (
				<QueryError
					object="模型供应商"
					error={providers.error}
					onRetry={() => void providers.refetch()}
					retrying={providers.isFetching}
				/>
			) : providers.data.length === 0 ? (
				<EmptyState
					icon={Server}
					title="暂无模型供应商"
					hint="尚未配置模型供应商。"
				/>
			) : (
				<>
					<ProviderTable
						providers={providers.data}
						onEdit={openEdit}
						onDelete={setDeleting}
					/>
					<ProviderCards
						providers={providers.data}
						onEdit={openEdit}
						onDelete={setDeleting}
					/>
				</>
			)}

			{formOpen ? (
				<ProviderFormDialog
					key={editing ? `${editing.providerKey}:${editing.version}` : "new"}
					provider={editing}
					onClose={() => setFormOpen(false)}
				/>
			) : null}
			{deleting ? (
				<DeleteProviderDialog
					provider={deleting}
					onClose={() => setDeleting(null)}
				/>
			) : null}
		</div>
	);
}

type ProviderListProps = {
	providers: ModelProvider[];
	onEdit: (provider: ModelProvider) => void;
	onDelete: (provider: ModelProvider) => void;
};

function ProviderTable({ providers, onEdit, onDelete }: ProviderListProps) {
	return (
		<div className="hidden rounded-lg bg-surface shadow-card md:block">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>供应商展示名</TableHead>
						<TableHead>供应商标识</TableHead>
						<TableHead>协议</TableHead>
						<TableHead>模型列表</TableHead>
						<TableHead>启用</TableHead>
						<TableHead className="text-right">操作</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{providers.map((provider) => (
						<TableRow
							key={provider.providerKey}
							data-testid={`provider-row-${provider.providerKey}`}
						>
							<TableCell>
								<p className="font-medium">{provider.displayName}</p>
								<p className="max-w-56 truncate text-xs text-label-tertiary">
									{provider.baseUrl}
								</p>
							</TableCell>
							<TableCell>{provider.providerKey}</TableCell>
							<TableCell>OpenAI 兼容</TableCell>
							<TableCell>{provider.models.join("、") || "—"}</TableCell>
							<TableCell>
								<Badge variant={provider.enabled ? "success" : "secondary"}>
									{provider.enabled ? "启用" : "停用"}
								</Badge>
							</TableCell>
							<TableCell>
								<div className="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => onEdit(provider)}
									>
										编辑
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => onDelete(provider)}
									>
										删除
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ProviderCards({ providers, onEdit, onDelete }: ProviderListProps) {
	return (
		<ul className="space-y-3 md:hidden">
			{providers.map((provider) => (
				<li
					key={provider.providerKey}
					className="space-y-3 rounded-lg bg-surface p-4 shadow-card"
					data-testid={`provider-card-${provider.providerKey}`}
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="truncate text-headline font-semibold text-label">
								{provider.displayName}
							</p>
							<p className="mt-1 text-footnote text-label-tertiary">
								{provider.providerKey}
							</p>
						</div>
						<Badge variant={provider.enabled ? "success" : "secondary"}>
							{provider.enabled ? "启用" : "停用"}
						</Badge>
					</div>
					<p className="break-all text-footnote text-label-secondary">
						{provider.baseUrl}
					</p>
					<p className="text-footnote text-label-secondary">
						OpenAI 兼容 · {provider.models.join("、") || "—"}
					</p>
					<div className="flex justify-end gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onEdit(provider)}
						>
							编辑
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onDelete(provider)}
						>
							删除
						</Button>
					</div>
				</li>
			))}
		</ul>
	);
}

function ProviderFormDialog({
	provider,
	onClose,
}: {
	provider: ModelProvider | null;
	onClose: () => void;
}) {
	const creating = provider === null;
	const [form, setForm] = useState<ProviderFormValue>(() =>
		provider ? toProviderForm(provider) : emptyProviderForm(),
	);
	const [error, setError] = useState<string | null>(null);
	const create = useCreateModelProviderMutation();
	const update = useUpdateModelProviderMutation(provider?.providerKey ?? "");
	const pending = create.isPending || update.isPending;

	const set = <Key extends keyof ProviderFormValue>(
		key: Key,
		value: ProviderFormValue[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
		setError(null);
	};

	const submit = async () => {
		const validation = validateProviderForm(form, creating);
		if (validation) {
			setError(validation);
			return;
		}
		try {
			if (provider) {
				await update.mutateAsync(form);
				toast.success("供应商已更新");
			} else {
				await create.mutateAsync(form);
				toast.success("供应商已新增");
			}
			onClose();
		} catch (submitError) {
			toast.error(toUserMessage(submitError));
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{creating ? "新增供应商" : "编辑供应商"}</DialogTitle>
					<DialogDescription>
						API Key 仅用于服务端调用，保存后不会在页面显示。
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 sm:grid-cols-2">
					<ProviderField label="供应商标识" htmlFor="provider-key">
						<Input
							id="provider-key"
							value={form.providerKey}
							readOnly={!creating}
							onChange={(event) => set("providerKey", event.target.value)}
							data-testid="provider-key-input"
						/>
					</ProviderField>
					<ProviderField label="供应商展示名" htmlFor="provider-name">
						<Input
							id="provider-name"
							value={form.displayName}
							onChange={(event) => set("displayName", event.target.value)}
							data-testid="provider-name-input"
						/>
					</ProviderField>
					<ProviderField label="协议" htmlFor="provider-protocol">
						<Input id="provider-protocol" value="OpenAI 兼容" readOnly />
					</ProviderField>
					<ProviderField label="接口基地址" htmlFor="provider-base-url">
						<Input
							id="provider-base-url"
							value={form.baseUrl}
							onChange={(event) => set("baseUrl", event.target.value)}
							data-testid="provider-url-input"
						/>
					</ProviderField>
					<ProviderField label="API Key" htmlFor="provider-api-key">
						<PasswordInput
							id="provider-api-key"
							value={form.apiKey}
							onChange={(event) => set("apiKey", event.target.value)}
							data-testid="provider-key-secret-input"
						/>
						{!creating ? (
							<p className="text-xs text-label-secondary">
								留空则保留原 API Key。
							</p>
						) : null}
					</ProviderField>
					<ProviderField label="模型列表" htmlFor="provider-models">
						<Textarea
							id="provider-models"
							value={form.models}
							onChange={(event) => set("models", event.target.value)}
							data-testid="provider-models-input"
						/>
						<p className="text-xs text-label-secondary">
							多个模型名请用英文逗号分隔。
						</p>
					</ProviderField>
				</div>
				<div className="space-y-3">
					<ProviderCheckbox
						label="允许知识库内容发送至该供应商"
						checked={form.dataEgressAllowed}
						onChange={(value) => set("dataEgressAllowed", value)}
						testId="provider-egress-input"
					/>
					<ProviderCheckbox
						label="启用"
						checked={form.enabled}
						onChange={(value) => set("enabled", value)}
						testId="provider-enabled-input"
					/>
				</div>
				{error ? (
					<p role="alert" className="text-footnote text-danger">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={pending}>
						取消
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={pending}
						data-testid="provider-save"
					>
						{pending ? "保存中…" : "保存"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProviderField({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	);
}

function ProviderCheckbox({
	label,
	checked,
	onChange,
	testId,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	testId: string;
}) {
	return (
		<label className="flex min-h-8 items-center gap-2 text-footnote text-label">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="size-4 accent-accent"
				data-testid={testId}
			/>
			{label}
		</label>
	);
}

function DeleteProviderDialog({
	provider,
	onClose,
}: {
	provider: ModelProvider;
	onClose: () => void;
}) {
	const remove = useDeleteModelProviderMutation();
	const confirm = async () => {
		try {
			await remove.mutateAsync(provider.providerKey);
			toast.success("供应商已删除");
			onClose();
		} catch (error) {
			toast.error(toUserMessage(error));
		}
	};
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>删除供应商“{provider.displayName}”？</DialogTitle>
					<DialogDescription>
						删除后，新运行将无法使用该供应商；正在进行的运行不受影响。
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={remove.isPending}
					>
						取消
					</Button>
					<Button
						variant="destructive"
						onClick={() => void confirm()}
						disabled={remove.isPending}
						data-testid="provider-delete-confirm"
					>
						确认删除
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
