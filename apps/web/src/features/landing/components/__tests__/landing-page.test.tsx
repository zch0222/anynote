import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "../landing-page";

/**
 * 落地页渲染（D-19 / M-14）。
 *
 * 这些用例护的是**画板之外、光看截图发现不了**的东西：
 *
 * 1. **语义结构**——一个 `h1`、区块标题是 `h2`、卡内标题是 `h3`。
 *    设计稿是纯视觉的，实现时很容易把标题全写成 `div` + 大字号；
 *    那样读屏用户听到的是一整片无层级的文本。
 * 2. **装饰性元素必须对读屏隐藏**——播放器、热力图、头像堆、示意条都是"画出来的"
 *    形状，各自带 `aria-hidden`，否则读屏会把它们念成一串无意义的空元素。
 * 3. **主视觉不能是 `<img>`**——它走 `background-image` 是有原因的（见组件注释：
 *    两个 `<img>` 会让两张主题图都被下载）。这条断言把那个决定钉住。
 * 4. **两态的文案差异真的渲染出来了**（移动副文短一截、页脚每列少一项由
 *    `hidden md:block` 控制，两段都在 DOM 里，靠 CSS 切换）。
 */
describe("落地页结构", () => {
  it("全页只有一个 h1，且就是主标题", () => {
    render(<LandingPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("把知识，安顿在一个安静的地方");
  });

  it("三个区块标题是 h2，五张 Bento 卡与两张 AI 卡的标题是 h3", () => {
    render(<LandingPage />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(h2).toEqual([
      "一个工作台，装下整个知识流",
      "AI，住进你的知识库",
      "现在，把知识安顿下来",
    ]);

    const h3 = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    // 五张 Bento 卡 + 两张 AI 卡 + 页脚三个列标题
    expect(h3.slice(0, 7)).toEqual([
      "知识库",
      "笔记",
      "慕课",
      "任务",
      "协同文档",
      "AI 问答",
      "PDF 问答",
    ]);
  });

  it("顶部导航与页脚各自是一块带名字的 landmark", () => {
    render(<LandingPage />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    // 导航用 aria-label 区分：站内导航一个、页脚三列各一个
    expect(screen.getByRole("navigation", { name: "站内导航" })).toBeInTheDocument();
    for (const title of ["产品", "资源", "关于"]) {
      expect(screen.getByRole("navigation", { name: title })).toBeInTheDocument();
    }
  });

  /**
   * 移动端每列少的那一项**位置不固定**（关于列去掉的是中间的「联系方式」，
   * 不是末项），所以这里按名字断言被隐藏的那一项，而不是数量。
   * 这条用例正是当初 `index >= 3` 写法留下的 bug 的复现。
   */
  it("页脚列里桌面独有项被标记为仅桌面可见，且隐藏的是正确的那一项", () => {
    const { container } = render(<LandingPage />);
    const hidden = [...container.querySelectorAll("footer nav li.hidden")].map(
      (li) => li.textContent,
    );
    expect(hidden.sort()).toEqual(["API", "联系方式", "更新日志"].sort());
  });

  it("页脚每列都渲染桌面 4 项（移动端只是把其中一项藏起来）", () => {
    render(<LandingPage />);
    for (const title of ["产品", "资源", "关于"]) {
      const column = screen.getByRole("navigation", { name: title });
      expect(column.querySelectorAll("li")).toHaveLength(4);
    }
  });
});

describe("落地页的可访问性与关键实现决定", () => {
  /**
   * 主视觉走 `background-image`，因此**没有** `<img>` 语义，需要显式 `role="img"` +
   * `aria-label` 才能让读屏用户知道那里有一张图。
   */
  it("主视觉用 role=img + aria-label 描述，不是裸 div", () => {
    render(<LandingPage />);
    const hero = screen.getByRole("img", { name: /安静的工作台/ });
    expect(hero).toBeInTheDocument();
    expect(hero.getAttribute("style")).toContain("--landing-hero");
  });

  it("纯装饰的示意图标对读屏隐藏", () => {
    const { container } = render(<LandingPage />);
    // 品牌 Logo、播放器、热力图、头像堆
    const decorated = container.querySelectorAll('[aria-hidden="true"]');
    expect(decorated.length).toBeGreaterThan(5);
    // 五张 Bento 卡 + 两张 AI 卡 = 7 个图标块，每块里的 svg 都该是装饰性的
    const tiles = container.querySelectorAll('[data-slot="landing-icon-tile"]');
    expect(tiles).toHaveLength(7);
    for (const tile of tiles) {
      expect(tile.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("两张主题主视觉不各写一个 img——只有 CSS 变量这一处引用", () => {
    const { container } = render(<LandingPage />);
    // 全页没有 <img>：主视觉是背景图
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("picture")).toHaveLength(0);
  });

  /**
   * 移动端与桌面端的文案差异靠两段 `<span>` 共存 + CSS 断点切换，
   * 所以两段都必须渲染出来（漏一段会让另一态少字，而截图只看一态时发现不了）。
   */
  it("两态文案都渲染：移动副文与桌面副文各一段", () => {
    const { container } = render(<LandingPage />);
    const sub = container.querySelector("h1")?.nextElementSibling;
    expect(sub?.querySelector(".md\\:hidden")?.textContent).toBe(
      "知识库、笔记、慕课、任务与协同文档，收进同一个工作台。",
    );
    expect(sub?.querySelector(".hidden")?.textContent).toContain("少一处切换，多一点专注。");
  });

  it("页脚品牌语也有两态文案", () => {
    render(<LandingPage />);
    expect(screen.getByText("安静、高效的知识工作站。")).toBeInTheDocument();
    expect(screen.getByText(/把笔记、课程、任务和协作/)).toBeInTheDocument();
  });
});

describe("落地页的转化入口", () => {
  it("三处「免费开始」都指向注册页", () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole("link", { name: "免费开始" });
    expect(ctas).toHaveLength(3);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/register");
  });

  it("「登录」指向登录页、「自托管部署」指向自托管文档", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "自托管部署" })).toHaveAttribute(
      "href",
      "/docs/self-hosting",
    );
  });

  it("页内锚点链接与区块 id 对得上（否则点了没反应）", () => {
    const { container } = render(<LandingPage />);
    for (const id of ["features", "ai"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});
