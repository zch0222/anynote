/**
 * Reka UI 下拉弹层测试辅助（供 M20.3+ 组件单测使用）：
 * 真实指针序列打开 USelect/USelectMenu 弹层并断言语义背景类存在。
 */
import type { VueWrapper } from '@vue/test-utils'

/** 触发打开下拉弹层并返回文档中的弹层内容元素 */
export async function openSelectDropdown(wrapper: VueWrapper, triggerSelector = 'button') {
  const trigger = wrapper.find(triggerSelector)
  if (!trigger.exists()) throw new Error(`下拉触发器不存在: ${triggerSelector}`)
  await trigger.trigger('pointerdown')
  await trigger.trigger('click')
  await new Promise((resolve) => setTimeout(resolve, 50))
  const content = document.querySelector('[data-reka-select-content], [role="listbox"]')
  if (!content) throw new Error('下拉弹层未打开')
  return content as HTMLElement
}

/** 断言弹层具备非透明语义背景/前景类（深浅色主题门禁） */
export function assertThemedDropdown(content: HTMLElement) {
  const cls = content.className
  if (!/bg-(default|elevated|muted)/.test(cls) && !content.querySelector('[class*="bg-"]')) {
    throw new Error(`下拉弹层缺少语义背景类: ${cls}`)
  }
}

/** 选择指定文本的选项 */
export async function selectThemedOption(wrapper: VueWrapper, optionText: string, triggerSelector = 'button') {
  const content = await openSelectDropdown(wrapper, triggerSelector)
  assertThemedDropdown(content)
  const option = Array.from(content.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent?.includes(optionText),
  )
  if (!option) throw new Error(`选项不存在: ${optionText}`)
  ;(option as HTMLElement).click()
  await new Promise((resolve) => setTimeout(resolve, 20))
}
