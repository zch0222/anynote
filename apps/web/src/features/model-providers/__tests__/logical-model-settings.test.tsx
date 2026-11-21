import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogicalModelCard } from "../components/logical-model-settings";
import type { ModelProvider } from "../schemas";

const hooks = vi.hoisted(() => ({
  logicalQuery: vi.fn(),
  logicalUpdate: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../use-model-providers", () => ({
  useLogicalConfigQuery: hooks.logicalQuery,
  useUpdateLogicalConfigMutation: (_logicalName: string) => hooks.logicalUpdate,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const providers: ModelProvider[] = [
  {
    providerKey: "openai",
    displayName: "OpenAI",
    protocol: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    models: ["text-embedding-3-small", "gpt-4o"],
    dataEgressAllowed: true,
    enabled: true,
    processReasoningMaxChars: 8000,
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
    processReasoningMaxChars: 8000,
    version: 1,
  },
];

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.logicalQuery.mockReturnValue(queryResult());
  hooks.logicalUpdate.isPending = false;
  hooks.logicalUpdate.mutateAsync.mockResolvedValue({
    logicalName: "embedding",
    providerKey: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    enabled: true,
    version: 1,
  });
});

describe("逻辑模型设置卡片", () => {
  /**
   * 验证 embedding 卡片保留向量关闭说明与既有交互。
   * @author 称霸幼儿园
   */
  it("展示已确认的向量关闭与重新启用说明", () => {
    renderWithProviders(<LogicalModelCard logicalName="embedding" providers={providers} />);
    expect(
      screen.getByText(
        "关闭后将停用语义检索和向量计算；已有向量保留，重新启用后执行索引对账补齐。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("向量索引模型（Embedding）")).toBeInTheDocument();
  });

  it("embedding 支持选择、手动输入模型名并保存", async () => {
    renderWithProviders(<LogicalModelCard logicalName="embedding" providers={providers} />);
    fireEvent.click(screen.getByTestId("embedding-enabled-input"));
    fireEvent.change(screen.getByTestId("embedding-provider-select"), {
      target: { value: "openai" },
    });
    expect(screen.getByTestId("embedding-model-input")).toHaveValue("text-embedding-3-small");
    fireEvent.change(screen.getByTestId("embedding-model-input"), {
      target: { value: "text-embedding-custom" },
    });
    fireEvent.change(screen.getByTestId("embedding-dimensions-input"), {
      target: { value: "1024" },
    });
    fireEvent.click(screen.getByTestId("embedding-save"));

    await waitFor(() =>
      expect(hooks.logicalUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          providerKey: "openai",
          model: "text-embedding-custom",
          dimensions: "1024",
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("模型配置已保存");
  });

  it("embedding 选中未允许数据出境供应商时展示警告并阻止保存", () => {
    renderWithProviders(<LogicalModelCard logicalName="embedding" providers={providers} />);
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
    expect(hooks.logicalUpdate.mutateAsync).not.toHaveBeenCalled();
  });

  /**
   * 验证 agent_main 卡片展示主对话模型文案与推理下拉并按对话口径校验。
   * @author 称霸幼儿园
   */
  it("agent_main 展示描述、推理下拉并以对话口径校验", async () => {
    hooks.logicalQuery.mockReturnValue(
      queryResult({
        data: {
          logicalName: "agent_main",
          providerKey: "",
          model: "",
          enabled: false,
          version: 0,
        },
      }),
    );
    renderWithProviders(<LogicalModelCard logicalName="agent_main" providers={providers} />);
    expect(screen.getByText("主对话模型（agent_main）")).toBeInTheDocument();
    expect(
      screen.getByText(
        "配置知识库 Agent 对话使用的主模型；运行中的对话继续用开跑时的配置，新对话立即使用新配置。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agent_main-reasoning-format-select")).toBeInTheDocument();
    expect(screen.getByTestId("agent_main-reasoning-passthrough-select")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent_main-enabled-input"));
    fireEvent.click(screen.getByTestId("agent_main-save"));
    expect(screen.getByTestId("agent_main-error")).toHaveTextContent("请选择模型供应商");

    fireEvent.change(screen.getByTestId("agent_main-provider-select"), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByTestId("agent_main-model-input"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("agent_main-save"));
    expect(screen.getByTestId("agent_main-error")).toHaveTextContent("请选择模型");

    fireEvent.change(screen.getByTestId("agent_main-reasoning-format-select"), {
      target: { value: "think_tag" },
    });
    fireEvent.change(screen.getByTestId("agent_main-reasoning-passthrough-select"), {
      target: { value: "original" },
    });
    fireEvent.change(screen.getByTestId("agent_main-model-input"), {
      target: { value: "gpt-4o" },
    });
    fireEvent.click(screen.getByTestId("agent_main-save"));
    await waitFor(() =>
      expect(hooks.logicalUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          providerKey: "openai",
          model: "gpt-4o",
          reasoningFormat: "think_tag",
          reasoningPassthrough: "original",
        }),
      ),
    );
  });

  /**
   * 验证 fast 卡片的标题与关闭说明。
   * @author 称霸幼儿园
   */
  it("fast 展示历史压缩模型文案", () => {
    renderWithProviders(<LogicalModelCard logicalName="fast" providers={providers} />);
    expect(screen.getByText("历史压缩模型（fast）")).toBeInTheDocument();
    expect(
      screen.getByText("关闭后使用该模型的调用将不可用，新对话会启动失败。"),
    ).toBeInTheDocument();
  });
});
