import { Extension } from "@tiptap/core";

/**
 * `tiptap-markdown` 内置的 `markdownTightLists` 只给 `bulletList` / `orderedList` 挂了 `tight`
 * 全局属性，`taskList` 被漏掉 —— 结果任务列表序列化时会被当成 loose list，项与项之间插入空行。
 *
 * 这里把 `tight` 属性补到 `taskList` 上（判定规则与内置实现一致：无 `<p>` 子节点即 tight），
 * 让任务列表与普通列表保持同样的紧凑输出。
 */
export const AnynoteTightTaskList = Extension.create({
  name: "anynoteTightTaskList",

  addGlobalAttributes() {
    return [
      {
        types: ["taskList"],
        attributes: {
          tight: {
            default: true,
            parseHTML: (element) =>
              element.getAttribute("data-tight") === "true" || !element.querySelector("p"),
            // 不往 DOM 上写额外属性，纯粹给 markdown 序列化用
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});
