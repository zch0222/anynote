import { describe, expect, it } from "vitest";
import {
  emptyLogicalForm,
  emptyProviderForm,
  isValidProviderBaseUrl,
  parseEmbeddingDimensions,
  parseProcessReasoningMaxChars,
  parseProviderModels,
  toLogicalForm,
  toProviderForm,
  validateLogicalForm,
  validateProviderForm,
} from "../schemas";

describe("模型供应商表单", () => {
  it("只接受带主机的 HTTP/HTTPS 地址", () => {
    expect(isValidProviderBaseUrl("http://localhost:8000/v1")).toBe(true);
    expect(isValidProviderBaseUrl("https://api.example.com/v1")).toBe(true);
    expect(isValidProviderBaseUrl("file:///tmp/model")).toBe(false);
    expect(isValidProviderBaseUrl("not-a-url")).toBe(false);
  });

  it("模型名按英文逗号拆分、去空并去重", () => {
    expect(parseProviderModels("gpt-4o, gpt-4o-mini,gpt-4o, ,")).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("新增要求 Key，更新允许留空保留", () => {
    const form = {
      ...emptyProviderForm(),
      providerKey: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    };
    expect(validateProviderForm(form, true)).toBe("请输入 API Key");
    expect(validateProviderForm(form, false)).toBeNull();
  });

  it("编辑表单不回填 API Key", () => {
    const form = toProviderForm({
      providerKey: "openai",
      displayName: "OpenAI",
      protocol: "openai_compatible",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4o"],
      dataEgressAllowed: true,
      enabled: true,
      processReasoningMaxChars: 8000,
      version: 2,
    });
    expect(form.apiKey).toBe("");
    expect(form.models).toBe("gpt-4o");
    expect(form.processReasoningMaxChars).toBe("8000");
  });

  it("思考截断字数只接受 500 到 200000 之间的整数", () => {
    expect(parseProcessReasoningMaxChars("500")).toBe(500);
    expect(parseProcessReasoningMaxChars(" 200000 ")).toBe(200000);
    expect(parseProcessReasoningMaxChars("499")).toBeNull();
    expect(parseProcessReasoningMaxChars("200001")).toBeNull();
    expect(parseProcessReasoningMaxChars("8000.5")).toBeNull();
    expect(parseProcessReasoningMaxChars("")).toBeNull();
    const form = {
      ...emptyProviderForm(),
      providerKey: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk",
      processReasoningMaxChars: "abc",
    };
    expect(validateProviderForm(form, true)).toBe("思考截断字数必须为 500 到 200000 之间的整数");
    expect(validateProviderForm({ ...form, processReasoningMaxChars: "8000" }, true)).toBeNull();
  });
});

const providers = [
  {
    providerKey: "local",
    displayName: "Local",
    protocol: "openai_compatible",
    baseUrl: "http://localhost:11434/v1",
    models: ["bge-m3"],
    dataEgressAllowed: false,
    enabled: true,
    processReasoningMaxChars: 8000,
    version: 1,
  },
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
];

describe("逻辑模型运行时配置表单", () => {
  it("维度支持留空自动探测与 1 到 2048 整数校验", () => {
    expect(parseEmbeddingDimensions("")).toEqual({ ok: true, value: undefined });
    expect(parseEmbeddingDimensions("1536")).toEqual({ ok: true, value: 1536 });
    expect(parseEmbeddingDimensions("0")).toEqual({ ok: false });
    expect(parseEmbeddingDimensions("2049")).toEqual({ ok: false });
    expect(parseEmbeddingDimensions("15.5")).toEqual({ ok: false });
  });

  /**
   * 验证 embedding 表单保留向量口径的完整校验链。
   * @author 称霸幼儿园
   */
  it("启用向量索引时强制校验供应商、模型与数据出境", () => {
    expect(validateLogicalForm(emptyLogicalForm(), "embedding", providers)).toBeNull();
    expect(
      validateLogicalForm({ ...emptyLogicalForm(), enabled: true }, "embedding", providers),
    ).toBe("请选择模型供应商");
    expect(
      validateLogicalForm(
        { ...emptyLogicalForm(), enabled: true, providerKey: "openai" },
        "embedding",
        providers,
      ),
    ).toBe("请选择 Embedding 模型");
    expect(
      validateLogicalForm(
        {
          ...emptyLogicalForm(),
          enabled: true,
          providerKey: "local",
          model: "bge-m3",
          dimensions: "1024",
        },
        "embedding",
        providers,
      ),
    ).toBe("所选供应商未允许数据出境，无法用于知识向量索引");
    expect(
      validateLogicalForm(
        {
          ...emptyLogicalForm(),
          enabled: true,
          providerKey: "openai",
          model: "text-embedding-3-small",
          dimensions: "3072",
        },
        "embedding",
        providers,
      ),
    ).toBe("向量维度必须为 1 到 2048 之间的整数");
    expect(
      validateLogicalForm(
        {
          ...emptyLogicalForm(),
          enabled: true,
          providerKey: "openai",
          model: "text-embedding-3-small",
          dimensions: "1536",
        },
        "embedding",
        providers,
      ),
    ).toBeNull();
  });

  /**
   * 验证 agent_main 表单使用对话口径的模型与出境文案，且不校验维度。
   * @author 称霸幼儿园
   */
  it("agent_main 校验使用对话口径文案且忽略维度字段", () => {
    expect(
      validateLogicalForm(
        { ...emptyLogicalForm(), enabled: true, providerKey: "openai" },
        "agent_main",
        providers,
      ),
    ).toBe("请选择模型");
    expect(
      validateLogicalForm(
        {
          ...emptyLogicalForm(),
          enabled: true,
          providerKey: "local",
          model: "qwen",
          dimensions: "4096",
        },
        "agent_main",
        providers,
      ),
    ).toBe("所选供应商未允许数据出境，无法用于知识对话");
    expect(
      validateLogicalForm(
        {
          ...emptyLogicalForm(),
          enabled: true,
          providerKey: "openai",
          model: "gpt-4o",
        },
        "agent_main",
        providers,
      ),
    ).toBeNull();
  });

  /**
   * 验证后端配置对象回填表单（含推理配置）。
   * @author 称霸幼儿园
   */
  it("后端配置对象正确回填表单", () => {
    expect(
      toLogicalForm({
        logicalName: "agent_main",
        providerKey: "openai",
        model: "gpt-4o",
        dimensions: 1536,
        reasoningFormat: "think_tag",
        reasoningPassthrough: "original",
        supportsVision: true,
        enabled: true,
        version: 2,
      }),
    ).toEqual({
      enabled: true,
      providerKey: "openai",
      model: "gpt-4o",
      dimensions: "1536",
      reasoningFormat: "think_tag",
      reasoningPassthrough: "original",
      supportsVision: true,
    });
    expect(
      toLogicalForm({
        logicalName: "fast",
        supportsVision: false,
        enabled: false,
        version: 0,
      }),
    ).toEqual(emptyLogicalForm());
  });
});
