import { ShieldAlert } from "lucide-react";

export function ModelProviderAdminOnly() {
	return (
		<div
			role="alert"
			className="flex items-center gap-3 rounded-lg bg-surface p-5 text-footnote text-label-secondary"
		>
			<ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
			只有系统管理员可以管理模型供应商
		</div>
	);
}
