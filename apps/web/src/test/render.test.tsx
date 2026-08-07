import { renderHookWithProviders, renderWithProviders } from "@/test/render";
import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * 测试基建自检：验证 JSX 转译、jsdom 环境、jest-dom matcher 与
 * QueryClientProvider 包装四条链路都通。业务用例不必模仿这个文件。
 */
describe("测试基建", () => {
  it("能渲染组件并用 jest-dom matcher 断言", () => {
    function Hello() {
      return <h1>你好，Anynote</h1>;
    }

    renderWithProviders(<Hello />);

    expect(screen.getByRole("heading", { name: "你好，Anynote" })).toBeInTheDocument();
  });

  it("能跑通 TanStack Query hook", async () => {
    const { result } = renderHookWithProviders(() =>
      useQuery({ queryKey: ["ping"], queryFn: () => Promise.resolve("pong") }),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBe("pong");
  });
});
