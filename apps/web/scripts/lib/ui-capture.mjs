/**
 * `scripts/ui-capture.mjs` 里**不需要浏览器**的判定逻辑。
 *
 * 拆出来的理由与 `lib/bundle.mjs`、`lib/css-tokens.mjs` 一致：脚本里读盘 / 起浏览器
 * 的 IO 外壳测不了，但"该拿哪张参考图、对比图叫什么名字、种子正文长什么样"
 * 是纯函数——它们错了会让整个对比任务产出**看起来正常但实际对错页**的图，
 * 比脚本直接崩掉更难发现，所以要有单测盯住。
 */

/**
 * 场景在某个主题下对应的设计稿参考图。
 *
 * `ref` 允许两种写法：
 * - 字符串：深浅两态共用一张拼版（加载体系那几页把两个主题画在同一页）；
 * - `{ light, dark }`：深浅**各占一页**（编辑器 p04/p06、移动端 p09/p11）。
 *
 * 拿深色截图去对浅色页，会把"主题差异"读成"还原度差距"——所以这个区分是必要的，
 * 不是冗余配置。
 *
 * @param {{ref?: string | {light?: string, dark?: string}}} scene
 * @param {"light" | "dark"} theme
 * @returns {string | null} 参考图文件名；该主题没有对应页时返回 null（只出截图，不假装对比过）
 */
export function resolveReference(scene, theme) {
  const ref = scene?.ref;
  if (typeof ref === "string") return ref || null;
  if (ref && typeof ref === "object") return ref[theme] || null;
  return null;
}

/** 对比图文件名。**带主题后缀**：同场景两态各拼一张，覆盖写会让后一张顶掉前一张。 */
export function comparisonFileName(sceneName, theme) {
  return `${sceneName}-compare-${theme}.png`;
}

/**
 * 与设计稿同构的种子正文。
 *
 * 逐句对着设计稿 p04 / p09 抄：H1 标题 → 引言段 → H2「一、按钮与操作」
 * → 三条无序列表 → INFO 引用块 → H2「二、反馈与状态」→ 段落。
 *
 * 为什么必须**照抄**而不是随手写一段：这几屏要判的是"标题是不是正文的一部分、
 * 元信息行在不在它之上、正文行的视觉密度像不像"。正文换成长短不一的句子之后，
 * 版式差异与内容差异就混在一起，没法判。
 *
 * ⚠️ 引用块用 `> [!INFO]` 而不是裸 `>`：这是仓库里 callout 的语法
 * （见 `components/editor/extensions/anynote-callout.ts`），设计稿那块灰底引文
 * 就对应它。**当前网关的 XSS 过滤器会把 JSON body 里的 `>` 转义成 `&gt;`**，
 * 落库后这段会退化成一行普通段落（缺陷已记录，见 changelist 的审计要点），
 * 这是后端问题不是本脚本的问题——保留正确语法，后端修好后这里不用再改。
 */
export function buildNoteBody(title) {
  return `# ${title}

这份清单用于约束 Anynote 全站的交互细节。它属于「产品设计知识库 · 设计原则」分组，任何新增页面在提测前都应逐条自检。

## 一、按钮与操作

- 一个屏幕内只保留一个主按钮，其余一律降级为次要按钮
- 危险操作必须二次确认，且默认焦点不落在确认按钮上
- 所有可点击元素的命中区域不小于 44 × 44

> [!INFO]
> 原则：界面的「安静」来自克制，而不是来自留白。同一屏内互相竞争的强调色不应超过一个。

## 二、反馈与状态

任何一次用户操作都必须在 100ms 内给出可见反馈；超过 1 秒的操作要展示进度；失败必须说明原因并给出下一步动作。`;
}
