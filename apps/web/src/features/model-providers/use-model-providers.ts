"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { aiApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelProviderQueryKeys } from "./query-keys";
import {
	type ModelProvider,
	type ProviderFormValue,
	modelProviderListSchema,
	modelProviderSchema,
	parseProviderModels,
} from "./schemas";

function request() {
	return { parseAs: "stream", signal: AbortSignal.timeout(15_000) } as const;
}

export function useModelProvidersQuery() {
	return useQuery({
		queryKey: modelProviderQueryKeys.list,
		queryFn: async (): Promise<ModelProvider[]> => {
			const { response } = await aiApi.GET(
				"/v1/admin/model-providers",
				request(),
			);
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
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
	});
}

export function useUpdateModelProviderMutation(providerKey: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (value: ProviderFormValue): Promise<ModelProvider> => {
			const { apiKey, ...body } = createBody(value);
			const { response } = await aiApi.PUT(
				"/v1/admin/model-providers/{providerKey}",
				{
					...request(),
					params: { path: { providerKey } },
					body: apiKey ? { ...body, apiKey } : body,
				},
			);
			return unwrapEnvelope(response, modelProviderSchema.parse);
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
	});
}

export function useDeleteModelProviderMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (providerKey: string): Promise<void> => {
			const { response } = await aiApi.DELETE(
				"/v1/admin/model-providers/{providerKey}",
				{
					...request(),
					params: { path: { providerKey } },
				},
			);
			await unwrapEnvelope(response, () => undefined);
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: modelProviderQueryKeys.all }),
	});
}
