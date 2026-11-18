import { renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProviderForm } from "../schemas";
import {
  useCreateModelProviderMutation,
  useDeleteModelProviderMutation,
  useLogicalConfigQuery,
  useModelProvidersQuery,
  useUpdateLogicalConfigMutation,
  useUpdateModelProviderMutation,
} from "../use-model-providers";

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
}));
vi.mock("@/lib/api/openapi", () => ({ aiApi: api }));

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

function response(data: unknown) {
  return new Response(JSON.stringify({ code: "00000", msg: "操作成功", data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function form(): ReturnType<typeof emptyProviderForm> {
  return {
    ...emptyProviderForm(),
    providerKey: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    models: "gpt-4o,gpt-4o",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("模型供应商数据访问", () => {
  it("列表经 ai 域 typed client 获取并校验", async () => {
    api.GET.mockResolvedValue({ response: response([provider]) });
    const { result } = renderHookWithProviders(() => useModelProvidersQuery());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([provider]);
    expect(api.GET).toHaveBeenCalledWith(
      "/v1/admin/model-providers",
      expect.objectContaining({ parseAs: "stream" }),
    );
  });

  it("新增发送完整字段且模型去重", async () => {
    api.POST.mockResolvedValue({ response: response(provider) });
    const { result } = renderHookWithProviders(() => useCreateModelProviderMutation());
    await result.current.mutateAsync(form());
    expect(api.POST.mock.calls[0]?.[0]).toBe("/v1/admin/model-providers");
    expect(api.POST.mock.calls[0]?.[1].body.models).toEqual(["gpt-4o"]);
    expect(api.POST.mock.calls[0]?.[1].body.apiKey).toBe("sk-test");
  });

  it("更新空 Key 不发送替换凭据", async () => {
    api.PUT.mockResolvedValue({ response: response(provider) });
    const { result } = renderHookWithProviders(() => useUpdateModelProviderMutation("openai"));
    await result.current.mutateAsync({ ...form(), apiKey: " " });
    expect(api.PUT.mock.calls[0]?.[1].params).toEqual({
      path: { providerKey: "openai" },
    });
    expect(api.PUT.mock.calls[0]?.[1].body.apiKey).toBeUndefined();
  });

  it("删除使用路径标识", async () => {
    api.DELETE.mockResolvedValue({ response: response("SUCCESS") });
    const { result } = renderHookWithProviders(() => useDeleteModelProviderMutation());
    await result.current.mutateAsync("openai");
    expect(api.DELETE).toHaveBeenCalledWith(
      "/v1/admin/model-providers/{providerKey}",
      expect.objectContaining({ params: { path: { providerKey: "openai" } } }),
    );
  });

  /**
   * 验证逻辑模型配置按用途名读写通用端点。
   * @author 称霸幼儿园
   */
  it("按逻辑名查询与保存运行时配置", async () => {
    const logicalConfig = {
      logicalName: "agent_main",
      providerKey: "openai",
      model: "gpt-4o",
      dimensions: undefined,
      reasoningFormat: "think_tag",
      reasoningPassthrough: "original",
      enabled: true,
      version: 1,
    };
    api.GET.mockResolvedValue({ response: response(logicalConfig) });
    const { result: queryResult } = renderHookWithProviders(() =>
      useLogicalConfigQuery("agent_main"),
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(logicalConfig);
    expect(api.GET).toHaveBeenCalledWith(
      "/v1/admin/model-providers/logical/{logicalName}",
      expect.objectContaining({
        params: { path: { logicalName: "agent_main" } },
        parseAs: "stream",
      }),
    );

    api.PUT.mockResolvedValue({ response: response(logicalConfig) });
    const { result: mutationResult } = renderHookWithProviders(() =>
      useUpdateLogicalConfigMutation("agent_main"),
    );
    await mutationResult.current.mutateAsync({
      enabled: true,
      providerKey: "openai",
      model: "gpt-4o",
      dimensions: "",
      reasoningFormat: "think_tag",
      reasoningPassthrough: "original",
    });
    expect(api.PUT.mock.calls[0]?.[0]).toBe("/v1/admin/model-providers/logical/{logicalName}");
    expect(api.PUT.mock.calls[0]?.[1].body).toEqual({
      enabled: true,
      providerKey: "openai",
      model: "gpt-4o",
      reasoningFormat: "think_tag",
      reasoningPassthrough: "original",
    });
  });

  /**
   * 验证 embedding 表单仍发送维度，且推理配置照常下发。
   * @author 称霸幼儿园
   */
  it("embedding 保存载荷包含维度", async () => {
    const embeddingConfig = {
      logicalName: "embedding",
      providerKey: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      enabled: true,
      version: 1,
    };
    api.PUT.mockResolvedValue({ response: response(embeddingConfig) });
    const { result } = renderHookWithProviders(() => useUpdateLogicalConfigMutation("embedding"));
    await result.current.mutateAsync({
      enabled: true,
      providerKey: "openai",
      model: "text-embedding-3-small",
      dimensions: "1536",
      reasoningFormat: "none",
      reasoningPassthrough: "none",
    });
    expect(api.PUT.mock.calls[0]?.[1].body).toEqual({
      enabled: true,
      providerKey: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      reasoningFormat: "none",
      reasoningPassthrough: "none",
    });
  });
});
