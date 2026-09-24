import { type Locator, type Page, expect } from "@playwright/test";

/**
 * 等编辑器**真正可写**，再返回正文容器。
 *
 * 只等 `toBeVisible` 是不够的：协同模式下正文的唯一真相是 Y.Doc，而它在「连接中」与
 * 「已连上但冷启动注入还没完成」这两段时间里是空的，此时编辑器是只读的
 * （`use-collab-note` 的 `contentReady`，方案 §7.4）——放开编辑就等于让用户对着空白
 * 编辑器打字、那一拍保存覆盖掉库里的正文。所以这里必须等 `contenteditable="true"`，
 * 否则用例敲下的那几下按键会被整段丢掉，表现成「输入没保存」。
 */
export async function focusWritableEditor(page: Page): Promise<Locator> {
  const surface = page.locator(".anynote-editor__content").first();
  await expect(surface).toBeVisible({ timeout: 30_000 });
  await expect(surface).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
  await surface.click();
  return surface;
}

/** 选中完整文本再真实输入，避免 End 只选中视觉行或布局变化导致空选区。 */
async function replaceBlock(block: Locator, text: string) {
  // 只读态下 closest('[contenteditable="true"]') 会是 null，直接抛 TypeError
  await focusWritableEditor(block.page());
  await expect(block).toBeVisible();
  const previous = await block.textContent();
  await block.evaluate((element) => {
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect.poll(() => block.evaluate(() => window.getSelection()?.toString())).toBe(previous);
  await block.page().keyboard.insertText(text);
  await expect(block).toHaveText(text);
}

export async function replaceLeadingHeading(page: Page, text: string) {
  await replaceBlock(page.locator(".anynote-editor__content h1").first(), text);
}

export async function replaceLastParagraph(page: Page, text: string) {
  await replaceBlock(page.locator(".anynote-editor__content p").last(), text);
}
