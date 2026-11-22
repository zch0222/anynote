"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { aiApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelProviderQueryKeys } from "./query-keys";
import {
  type LogicalFormValue,
  type LogicalModelConfig,
  type ModelProvider,
  type ProviderFormValue,
  logicalModelConfigSchema,
  modelProviderListSchema,
  modelProviderSchema,
  parseEmbeddingDimensions,
  parseProviderModels,
} from "./schemas";

function request() {
  return { parseAs: "stream", signal: AbortSignal.timeout(15_000) } as const;
}

export function useModelProvidersQuery() {
  return useQuery({
    queryKey: modelProviderQueryKeys.list,
    queryFn: async (): Promise<ModelProvider[]> => {
      const { response } = await aiApi.GET("/v1/admin/model-providers", request());
      return unwrapEnvelope(response, modelProviderListSchema.parse);
    },
  });
}

function createBody(value: ProviderFormValue) {
  return {
    providerKey: value.providerKey.trim(),
    displayName: value.displayName.trim(),
    protocol: value.protocol,
    baseUrl: value.baseUrl.trim(),
    apiKey: value.apiKey.trim(),
    models: parseProviderModels(value.models),
    dataEgressAllowed: value.dataEgressAllowed,
    enabled: value.enabled,
    processReasoningMaxChars: Number(value.processReasoningMaxChars.trim()),
  };
}

export function useCreateModelProviderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: ProviderFormValue): Promise<ModelProvider> => {
      const { response } = await aiApi.POST("/v1/admin/model-providers", {
        ...request(),
        body: createBody(value),
      });
      return unwrapEnvelope(response, modelProviderSchema.parse);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
  });
}

export function useUpdateModelProviderMutation(providerKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: ProviderFormValue): Promise<ModelProvider> => {
      const { apiKey, ...body } = createBody(value);
      const { response } = await aiApi.PUT("/v1/admin/model-providers/{providerKey}", {
        ...request(),
        params: { path: { providerKey } },
        body: apiKey ? { ...body, apiKey } : body,
      });
      return unwrapEnvelope(response, modelProviderSchema.parse);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
  });
}

export function useDeleteModelProviderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (providerKey: string): Promise<void> => {
      const { response } = await aiApi.DELETE("/v1/admin/model-providers/{providerKey}", {
        ...request(),
        params: { path: { providerKey } },
      });
      await unwrapEnvelope(response, () => undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
  });
}

export function useLogicalConfigQuery(logicalName: string) {
  return useQuery({
    queryKey: modelProviderQueryKeys.logical(logicalName),
    queryFn: async (): Promise<LogicalModelConfig> => {
      const { response } = await aiApi.GET("/v1/admin/model-providers/logical/{logicalName}", {
        ...request(),
        params: { path: { logicalName } },
      });
      return unwrapEnvelope(response, logicalModelConfigSchema.parse);
    },
  });
}

export function useUpdateLogicalConfigMutation(logicalName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: LogicalFormValue): Promise<LogicalModelConfig> => {
      const parsedDimensions = parseEmbeddingDimensions(value.dimensions);
      const providerKey = value.providerKey.trim();
      const model = value.model.trim();
      const body: {
        enabled: boolean;
        providerKey?: string;
        model?: string;
        dimensions?: number;
        reasoningFormat: LogicalFormValue["reasoningFormat"];
        reasoningPassthrough: LogicalFormValue["reasoningPassthrough"];
        supportsVision: boolean;
      } = {
        enabled: value.enabled,
        reasoningFormat: value.reasoningFormat,
        reasoningPassthrough: value.reasoningPassthrough,
        supportsVision: value.supportsVision,
      };
      if (providerKey) body.providerKey = providerKey;
      if (model) body.model = model;
      if (
        logicalName === "embedding" &&
        parsedDimensions.ok &&
        parsedDimensions.value !== undefined
      ) {
        body.dimensions = parsedDimensions.value;
      }
      const { response } = await aiApi.PUT("/v1/admin/model-providers/logical/{logicalName}", {
        ...request(),
        params: { path: { logicalName } },
        body,
      });
      return unwrapEnvelope(response, logicalModelConfigSchema.parse);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: modelProviderQueryKeys.logical(logicalName),
      }),
  });
}
