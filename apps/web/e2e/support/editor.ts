import { type Locator, type Page, expect } from "@playwright/test";

/** 选中完整文本再真实输入，避免 End 只选中视觉行或布局变化导致空选区。 */
async function replaceBlock(block: Locator, text: string) {
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
