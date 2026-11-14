import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelProviderSettings } from "../components/model-provider-settings";

const hooks = vi.hoisted(() => ({
	query: vi.fn(),
	create: { mutateAsync: vi.fn(), isPending: false },
	update: { mutateAsync: vi.fn(), isPending: false },
	remove: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../use-model-providers", () => ({
	useModelProvidersQuery: hooks.query,
	useCreateModelProviderMutation: () => hooks.create,
	useUpdateModelProviderMutation: () => hooks.update,
	useDeleteModelProviderMutation: () => hooks.remove,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const provider = {
	providerKey: "openai",
	displayName: "OpenAI",
	protocol: "openai_compatible",
	baseUrl: "https://api.openai.com/v1",
	models: ["gpt-4o"],
	dataEgressAllowed: true,
	enabled: true,
	version: 1,
};

beforeEach(() => {
	vi.clearAllMocks();
	hooks.query.mockReturnValue({
		data: [provider],
		isPending: false,
		isError: false,
	});
	hooks.create.mutateAsync.mockResolvedValue(provider);
	hooks.update.mutateAsync.mockResolvedValue(provider);
	hooks.remove.mutateAsync.mockResolvedValue(undefined);
});

describe("模型供应商管理页面", () => {
	it("同时提供桌面表格与移动卡片，编辑不回填 Key", async () => {
		renderWithProviders(<ModelProviderSettings />);
		expect(screen.getByTestId("provider-row-openai")).toBeInTheDocument();
		expect(screen.getByTestId("provider-card-openai")).toBeInTheDocument();
		fireEvent.click(
			within(screen.getByTestId("provider-row-openai")).getByRole("button", {
				name: "编辑",
			}),
		);
		expect(screen.getByTestId("provider-key-input")).toHaveAttribute(
			"readonly",
		);
		expect(screen.getByTestId("provider-key-secret-input")).toHaveValue("");
		fireEvent.click(screen.getByTestId("provider-save"));
		await waitFor(() => expect(hooks.update.mutateAsync).toHaveBeenCalled());
		expect(hooks.update.mutateAsync.mock.calls[0]?.[0]?.apiKey).toBe("");
	});

	it("新增缺少 Key 时显示已确认校验文案", () => {
		renderWithProviders(<ModelProviderSettings />);
		fireEvent.click(screen.getByTestId("provider-create"));
		fireEvent.change(screen.getByTestId("provider-key-input"), {
			target: { value: "openai" },
		});
		fireEvent.change(screen.getByTestId("provider-name-input"), {
			target: { value: "OpenAI" },
		});
		fireEvent.change(screen.getByTestId("provider-url-input"), {
			target: { value: "https://api.openai.com/v1" },
		});
		fireEvent.click(screen.getByTestId("provider-save"));
		expect(screen.getByRole("alert")).toHaveTextContent("请输入 API Key");
		expect(hooks.create.mutateAsync).not.toHaveBeenCalled();
	});

	it("新增成功后提交表单", async () => {
		renderWithProviders(<ModelProviderSettings />);
		fireEvent.click(screen.getByTestId("provider-create"));
		fireEvent.change(screen.getByTestId("provider-key-input"), {
			target: { value: "openai" },
		});
		fireEvent.change(screen.getByTestId("provider-name-input"), {
			target: { value: "OpenAI" },
		});
		fireEvent.change(screen.getByTestId("provider-url-input"), {
			target: { value: "https://api.openai.com/v1" },
		});
		fireEvent.change(screen.getByTestId("provider-key-secret-input"), {
			target: { value: "sk-test" },
		});
		fireEvent.click(screen.getByTestId("provider-save"));
		await waitFor(() => expect(hooks.create.mutateAsync).toHaveBeenCalled());
	});

	it("删除必须二次确认", async () => {
		renderWithProviders(<ModelProviderSettings />);
		fireEvent.click(
			within(screen.getByTestId("provider-row-openai")).getByRole("button", {
				name: "删除",
			}),
		);
		expect(hooks.remove.mutateAsync).not.toHaveBeenCalled();
		expect(
			screen.getByText(
				"删除后，新运行将无法使用该供应商；正在进行的运行不受影响。",
			),
		).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("provider-delete-confirm"));
		await waitFor(() =>
			expect(hooks.remove.mutateAsync).toHaveBeenCalledWith("openai"),
		);
	});
});
