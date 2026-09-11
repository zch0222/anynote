import { expect, test } from "@playwright/test";

/**
 * 关键路径 4：AI 流式。
 *
 * 成功流式路径当前被后端阻塞（M7.6 第 1 条：ai-nio servlet 栈 reactor context
 * 丢失 + LLM 上游 ai-service 未部署）。因此这条用例断言的是**前端确实发起了
 * SSE 请求并进入了明确的终态**——成功时出现回答，失败时出现错误与重试入口。
 * 后端修好之后无需改用例，成功分支会自然被覆盖到。
 */
test.describe("关键路径 4：AI 流式对话", () => {
  test("发送消息会打到 SSE 端点，并进入成功或失败的明确状态", async ({ page }) => {
    await page.goto("/ai/chat");

    const composer = page.getByPlaceholder(/输入消息/);
    await expect(composer).toBeVisible({ timeout: 30_000 });

    const sseRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/proxy/aiNio/chat/completions") && request.method() === "POST",
      { timeout: 30_000 },
    );

    await composer.fill("用一句话介绍 Anynote");
    await page.getByRole("button", { name: "发送" }).click();

    const request = await sseRequest;
    expect(request.url()).toContain("/api/proxy/aiNio");

    // 用户消息立刻上屏
    await expect(page.getByText("用一句话介绍 Anynote").first()).toBeVisible();

    // 终态二选一：出现失败提示（当前后端状态），或出现 AI 回答
    const failed = page.getByText(/失败|出错|重试/).first();
    const answered = page.locator(".anynote-editor__content").first();
    await expect(failed.or(answered)).toBeVisible({ timeout: 45_000 });
  });

  test("流式进行中切走路由不会丢消息（会话状态挂在 store 上）", async ({ page }) => {
    await page.goto("/ai/chat");
    const composer = page.getByPlaceholder(/输入消息/);
    await expect(composer).toBeVisible({ timeout: 30_000 });

    await composer.fill("切页不丢消息校验");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("切页不丢消息校验").first()).toBeVisible();

    // 必须是 SPA 软导航：整页 goto 会重建 JS 进程，store 本来就会清空，
    // 那样测的就不是「切页不丢消息」了。侧栏里「工作台」有品牌位与导航位两个
    // 链接，用 exact 锁定导航位那个。
    await page.getByRole("link", { name: "工作台", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goBack();

    await expect(page.getByText("切页不丢消息校验").first()).toBeVisible({ timeout: 30_000 });
  });
});
