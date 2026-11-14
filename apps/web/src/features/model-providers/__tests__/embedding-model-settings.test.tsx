import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingModelSettings } from "../components/embedding-model-settings";
import type { ModelProvider } from "../schemas";

const hooks = vi.hoisted(() => ({
	embeddingQuery: vi.fn(),
	embeddingUpdate: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../use-model-providers", () => ({
	useEmbeddingConfigQuery: hooks.embeddingQuery,
	useUpdateEmbeddingConfigMutation: () => hooks.embeddingUpdate,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const providers: ModelProvider[] = [
	{
		providerKey: "openai",
		displayName: "OpenAI",
		protocol: "openai_compatible",
		baseUrl: "https://api.openai.com/v1",
		models: ["text-embedding-3-small", "text-embedding-3-large"],
		dataEgressAllowed: true,
		enabled: true,
		version: 1,
	},
	{
		providerKey: "private-local",
		displayName: "内网禁止出境",
		protocol: "openai_compatible",
		baseUrl: "http://10.0.0.5:8000/v1",
		models: ["bge-m3"],
		dataEgressAllowed: false,
		enabled: true,
		version: 1,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	hooks.embeddingQuery.mockReturnValue({
		data: {
			logicalName: "embedding",
			providerKey: "",
			model: "",
			dimensions: undefined,
			enabled: false,
			version: 0,
		},
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	});
	hooks.embeddingUpdate.isPending = false;
	hooks.embeddingUpdate.mutateAsync.mockResolvedValue({
		logicalName: "embedding",
		providerKey: "openai",
		model: "text-embedding-3-small",
		dimensions: 1536,
		enabled: true,
		version: 1,
	});
});

describe("Embedding 模型设置卡片", () => {
	it("支持从供应商列表选择、手动输入模型名并保存", async () => {
		renderWithProviders(<EmbeddingModelSettings providers={providers} />);
		expect(screen.getByText("向量索引模型（Embedding）")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("embedding-enabled-input"));
		fireEvent.change(screen.getByTestId("embedding-provider-select"), {
			target: { value: "openai" },
		});
		expect(screen.getByTestId("embedding-model-input")).toHaveValue(
			"text-embedding-3-small",
		);
		fireEvent.change(screen.getByTestId("embedding-model-select"), {
			target: { value: "text-embedding-3-large" },
		});
		expect(screen.getByTestId("embedding-model-input")).toHaveValue(
			"text-embedding-3-large",
		);
		fireEvent.change(screen.getByTestId("embedding-model-input"), {
			target: { value: "text-embedding-custom" },
		});
		fireEvent.change(screen.getByTestId("embedding-dimensions-input"), {
			target: { value: "1024" },
		});
		fireEvent.click(screen.getByTestId("embedding-save"));

		await waitFor(() =>
			expect(hooks.embeddingUpdate.mutateAsync).toHaveBeenCalledWith({
				enabled: true,
				providerKey: "openai",
				model: "text-embedding-custom",
				dimensions: "1024",
			}),
		);
		expect(toast.success).toHaveBeenCalledWith("Embedding 模型配置已保存");
	});

	it("选中未允许数据出境供应商时展示警告并阻止启用保存", () => {
		renderWithProviders(<EmbeddingModelSettings providers={providers} />);
		fireEvent.click(screen.getByTestId("embedding-enabled-input"));
		fireEvent.change(screen.getByTestId("embedding-provider-select"), {
			target: { value: "private-local" },
		});
		expect(screen.getByTestId("embedding-egress-warning")).toHaveTextContent(
			"所选供应商未允许数据出境，无法用于知识向量索引",
		);

		fireEvent.click(screen.getByTestId("embedding-save"));
		expect(screen.getByTestId("embedding-error")).toHaveTextContent(
			"所选供应商未允许数据出境，无法用于知识向量索引",
		);
		expect(hooks.embeddingUpdate.mutateAsync).not.toHaveBeenCalled();
	});

	it("校验供应商、模型与维度合法范围", () => {
		renderWithProviders(<EmbeddingModelSettings providers={providers} />);
		fireEvent.click(screen.getByTestId("embedding-enabled-input"));
		fireEvent.click(screen.getByTestId("embedding-save"));
		expect(screen.getByTestId("embedding-error")).toHaveTextContent(
			"请选择模型供应商",
		);

		fireEvent.change(screen.getByTestId("embedding-provider-select"), {
			target: { value: "openai" },
		});
		fireEvent.change(screen.getByTestId("embedding-model-input"), {
			target: { value: "" },
		});
		fireEvent.click(screen.getByTestId("embedding-save"));
		expect(screen.getByTestId("embedding-error")).toHaveTextContent(
			"请选择 Embedding 模型",
		);

		fireEvent.change(screen.getByTestId("embedding-model-input"), {
			target: { value: "text-embedding-3-small" },
		});
		fireEvent.change(screen.getByTestId("embedding-dimensions-input"), {
			target: { value: "4096" },
		});
		fireEvent.click(screen.getByTestId("embedding-save"));
		expect(screen.getByTestId("embedding-error")).toHaveTextContent(
			"向量维度必须为 1 到 2048 之间的整数",
		);
		expect(hooks.embeddingUpdate.mutateAsync).not.toHaveBeenCalled();
	});
});
