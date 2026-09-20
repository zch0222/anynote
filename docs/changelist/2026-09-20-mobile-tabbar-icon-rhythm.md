# 2026-09-20 移动端底栏图标行高节奏修复（mobile-tabbar-icon-rhythm）

## 概览

修复「底栏选中胶囊里的图标不居中、padding 不对」：标签文字用 `text-[0.6875rem]`（Tailwind 任意值字号，**不自带行高**），`<span>` 继承了 body 的 24px 行盒——11px 的字悬在 24px 行盒中部，图标被顶到胶囊上沿（顶留白仅 1px）、文字视觉下坠（距底约 7px），48 高胶囊内上下节奏失衡；图标 `size-5`（20px）也小于设计稿的 ≈22px。水平居中本身无损（偏移 0px），问题全在**垂直节奏**。

设计稿口径（M-01 画板底部导航像素实测，`docs/ui/ui-supplement/M-01-dashboard.png`）：图标 ≈22px、顶留白 ≈5、图标-文字 ≈7、文字行 ≈13。修复后 48 高胶囊内：22 + 5 + 13 = 40，`justify-center` 上下各 ≈4px，DOM 实测顶留白 4px / 底留白 4px / 行盒 13px / 图标 22×22 / 水平偏移 ≈0。

- 改动：3 个文件（修改 2 · 新增 1），+35 / -4 行（已跟踪文件），全部在 `apps/web`

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx vitest run src/components/layout/mobile/__tests__/mobile-tab-bar.test.tsx`（修复前先跑） | 修复前 1 failed / 1 passed，修复后 2 passed |
| `pnpm --filter web test`（全量前端单测） | **1833 passed**（含新增 2 条） |
| `npx playwright test --project=mobile mobile-core.spec.ts`（真实 Docker 栈 + 生产构建） | **27 passed**（含新增节奏守护 1 条） |
| 浏览器真实比对（内置浏览器 390×844） | DOM 实测：图标 22×22、水平偏移 ≈0、顶/底留白 4px/4px、标签行盒 13px；放大实拍与设计稿 M-01 底栏一致 |

> E2E 环境：后端为 `docker compose`（场景 A）真实栈；前端为宿主机 `NEXT_DISABLE_STANDALONE=1 pnpm --filter web build` + `npx next start`。

## apps/web — 组件修复

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/components/layout/mobile/mobile-tab-bar.tsx` | 修改 | 图标 `size-5`→`size-[22px]`；图标-文字间距 `gap-0.5`→`gap-[5px]`；标签加显式 `leading-[13px]`（不继承 body 24px 行盒）。三处合起来让 48 高选中胶囊内「图标 22 + 间距 5 + 文字 13」上下各留 ≈4px，与设计稿 M-01 底栏节奏对齐；未选中格同享同一组类 |

## apps/web — 单元测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/src/components/layout/mobile/__tests__/mobile-tab-bar.test.tsx` | 新增 | ① 四格顺序 / href / 深层路由点亮所属 tab 的 `aria-current`；② 复现断言：每格图标 `size-[22px]`、标签 `leading-[13px]`、格内 `gap-[5px]`（jsdom 不算 Tailwind 计算样式，断言类名集合即断言行高来源——修复前红） |

## apps/web — 端到端测试

| 文件 | 状态 | 作用与原因 |
|---|---|---|
| `apps/web/e2e/mobile-core.spec.ts` | 修改 | 「移动端外壳与导航」组新增 1 条：真实浏览器里断言选中格计算样式 `line-height === 13px`、图标 22px、顶留白与底留白差 ≤1px——任意值字号漏配行高的回归会被这条在门禁里拦下，不需要再人眼量像素 |

## 审计要点

1. **根因是 Tailwind 任意值字号的行高语义**：`text-[0.6875rem]` 不像 `text-xs`（0.75rem/1rem）那样自带配对行高，漏写的元素全部继承上游行盒。仓库里其它 `text-[…]` 用法若有同类「小字挂大行盒」的垂直失衡，同样手法排查（本次只修底栏，别处无症状不动）。
2. 类名断言（`toHaveClass("leading-[13px]")`）看似脆，实则是这里**唯一能落单测的层**：jsdom 不加载 Tailwind CSS，计算样式断言只能放 e2e；两层各守一层，不要互相替代。
3. 设计数值来源是 M-01 画板像素实测（见概览），不是图例转写——图例只给了 350×64 / 48 高两个数，内部节奏没有文字规格，评审若质疑 22/5/13 这组数请看画板底栏区域。

## 环境与过程备注（非代码改动）

- 设计稿比对方法：PIL 对 `M-01-dashboard.png`（3880×2480 @2x）做 accent 连通域定位选中胶囊（x[132,292] y[2172,2276]），收缩扫描区避开圆角露底后量白色字形分带，得到图标/文字/留白数值；实拍侧用 DOM `getBoundingClientRect` + 计算样式同口径复测。
