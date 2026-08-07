import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type RenderHookOptions,
  type RenderOptions,
  render,
  renderHook,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/**
 * 每个用例都要新建一份 QueryClient，避免缓存跨用例泄漏。
 * 关掉 retry，否则失败用例会重试到超时才报错。
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** 渲染组件，外层自动套 QueryClientProvider。 */
export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> = {},
) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(ui, { wrapper: createWrapper(queryClient), ...options }),
  };
}

/** 测试 use*Query / use*Mutation 用这个，外层自动套 QueryClientProvider。 */
export function renderHookWithProviders<Result, Props>(
  hook: (initialProps: Props) => Result,
  options: Omit<RenderHookOptions<Props>, "wrapper"> = {},
) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...renderHook(hook, { wrapper: createWrapper(queryClient), ...options }),
  };
}
