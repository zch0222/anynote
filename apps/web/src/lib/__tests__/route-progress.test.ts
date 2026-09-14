import {
  ROUTE_PROGRESS_MIN_VISIBLE_MS,
  ROUTE_PROGRESS_TIMEOUT_MS,
  type RouteProgressModifiers,
  type RouteProgressTarget,
  findAnchor,
  isInternalNavigation,
  isSameDocumentNavigation,
} from "@/lib/route-progress";
import { describe, expect, it } from "vitest";

/**
 * 路由进度条的判定逻辑。
 *
 * 这些用例护的是**会让进度条永远挂着**的误判：进度条一旦亮起却没人收，
 * 它会一直留在顶栏上。而误判的入口几乎全是"看起来像导航、其实当前页不动"
 * 的点击——修饰键开新标签、下载、外站、同页锚点。
 */

const CURRENT = "https://anynote.test/notes/7";

function target(href: string | null, overrides: Partial<RouteProgressTarget> = {}) {
  return { href, target: null, hasDownload: false, ...overrides } satisfies RouteProgressTarget;
}

function modifiers(overrides: Partial<RouteProgressModifiers> = {}) {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    ...overrides,
  } satisfies RouteProgressModifiers;
}

describe("isInternalNavigation：应当亮起的点击", () => {
  it("站内相对路径", () => {
    expect(isInternalNavigation(target("/notes/7/42"), modifiers(), CURRENT)).toBe(true);
  });

  it("站内绝对路径（同源）", () => {
    expect(isInternalNavigation(target("https://anynote.test/docs"), modifiers(), CURRENT)).toBe(
      true,
    );
  });

  it("查询串变化也算新页面", () => {
    expect(isInternalNavigation(target("/notes/7?new=1"), modifiers(), CURRENT)).toBe(true);
  });

  it('target="_self" 视为当前页导航', () => {
    expect(isInternalNavigation(target("/docs", { target: "_self" }), modifiers(), CURRENT)).toBe(
      true,
    );
  });
});

describe("isInternalNavigation：不该亮起的点击", () => {
  it("修饰键点击是「开新标签页」，当前页不动", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(
        isInternalNavigation(target("/docs"), modifiers({ [key]: true }), CURRENT),
        `${key} 按下时不该亮进度条`,
      ).toBe(false);
    }
  });

  it("中键 / 右键同理", () => {
    expect(isInternalNavigation(target("/docs"), modifiers({ button: 1 }), CURRENT)).toBe(false);
    expect(isInternalNavigation(target("/docs"), modifiers({ button: 2 }), CURRENT)).toBe(false);
  });

  it('target="_blank" 开新窗口', () => {
    expect(isInternalNavigation(target("/docs", { target: "_blank" }), modifiers(), CURRENT)).toBe(
      false,
    );
  });

  it("带 download 属性的链接是下载，不产生新页面", () => {
    expect(
      isInternalNavigation(target("/export.csv", { hasDownload: true }), modifiers(), CURRENT),
    ).toBe(false);
  });

  /**
   * 回归：**`<Link>` 自己就会 preventDefault**。
   *
   * 这条曾经是个真 bug：判定把 `defaultPrevented` 一律当作"别人抢走了这次点击"，
   * 而 Next 的 `Link` 对站内软导航**一定会**调 `preventDefault()`（它接管导航、
   * 不让浏览器整页刷新）。于是进度条在最常见的那条路径上**从不出现**，
   * 而单测与"点一下看看有没有"的手测都发现不了——单测没模拟 Link 的行为，
   * 手测用的是合成点击、也没经过 Link。
   *
   * 实测证据（真实栈上挂 document 监听器读事件对象）：
   *   `{"href":"/ai/chat","defaultPrevented":true,"button":0}`
   *
   * 修法是把 `defaultPrevented` **整个从判定输入里删掉**——所以这条用例
   * 断言的不是"传 true 时返回 true"（那个字段已经不存在了），而是
   * **签名里根本没有它**：传进去会被 TS 拒绝、运行时也被忽略。
   * 真正"被接管、不会导航"的场景（按钮式锚点、外站、修饰键、下载）
   * 都由别的条件覆盖，不需要这一条。
   */
  it("判定输入里不能有 defaultPrevented（Link 会 preventDefault，它不是放弃导航的信号）", () => {
    // @ts-expect-error defaultPrevented 是刻意从 RouteProgressModifiers 里删掉的
    const withFlag = modifiers({ defaultPrevented: true });
    /*
     * 断言的是**行为**而不是对象相等：多传的字段对判定毫无影响，
     * 站内链接的结果与不传时完全一致。（`toEqual` 会把这个多余字段
     * 当成差异报出来，所以这里比的是判定结果。）
     */
    expect(isInternalNavigation(target("/ai/chat"), withFlag, CURRENT)).toBe(true);
    // 对照组：不传时同样为 true——两条路径必须同结论，否则字段就还在起作用
    expect(isInternalNavigation(target("/ai/chat"), modifiers(), CURRENT)).toBe(true);
  });

  it("外站不亮（那是整页跳转，本站的进度条管不到）", () => {
    expect(isInternalNavigation(target("https://example.com/x"), modifiers(), CURRENT)).toBe(false);
  });

  it("协议不同的伪链接（mailto / tel / javascript）", () => {
    for (const href of ["mailto:a@b.c", "tel:+8610000000000", "javascript:void(0)"]) {
      expect(isInternalNavigation(target(href), modifiers(), CURRENT), href).toBe(false);
    }
  });

  it("没有 href 的锚点（按钮式的 <a>）", () => {
    expect(isInternalNavigation(target(null), modifiers(), CURRENT)).toBe(false);
    expect(isInternalNavigation(target(""), modifiers(), CURRENT)).toBe(false);
  });

  it("同页锚点（只改 hash）不产生新页面——最容易被误判成导航的一种", () => {
    expect(isInternalNavigation(target("#section"), modifiers(), CURRENT)).toBe(false);
    expect(isInternalNavigation(target("/notes/7#section"), modifiers(), CURRENT)).toBe(false);
  });

  it("地址完全没变", () => {
    expect(isInternalNavigation(target("/notes/7"), modifiers(), CURRENT)).toBe(false);
  });
});

describe("isSameDocumentNavigation", () => {
  it("path + query + origin 全同才算同文档", () => {
    const current = new URL("https://anynote.test/notes/7");
    expect(isSameDocumentNavigation(current, new URL("https://anynote.test/notes/7#x"))).toBe(true);
    expect(isSameDocumentNavigation(current, new URL("https://anynote.test/notes/7?a=1"))).toBe(
      false,
    );
    expect(isSameDocumentNavigation(current, new URL("https://anynote.test/notes/8"))).toBe(false);
    expect(isSameDocumentNavigation(current, new URL("https://other.test/notes/7"))).toBe(false);
  });
});

describe("findAnchor", () => {
  it("从嵌套子节点向上找到锚点", () => {
    document.body.innerHTML = '<a href="/x"><span><b id="deep">深</b></span></a>';
    const deep = document.getElementById("deep");
    expect(findAnchor(deep)?.getAttribute("href")).toBe("/x");
  });

  it("锚点自身", () => {
    document.body.innerHTML = '<a id="self" href="/x">x</a>';
    expect(findAnchor(document.getElementById("self"))?.id).toBe("self");
  });

  it("不在锚点内返回 null", () => {
    document.body.innerHTML = '<div id="plain"><span id="inner">x</span></div>';
    expect(findAnchor(document.getElementById("inner"))).toBeNull();
    expect(findAnchor(null)).toBeNull();
  });

  it("取最近的那个锚点（嵌套锚点是非法 HTML，但浏览器会拆开，这里只保证不越界）", () => {
    document.body.innerHTML = '<a id="outer" href="/o"><a id="inner" href="/i">x</a></a>';
    // 非法嵌套会被解析器重排，断言只需落在某个真实存在的锚点上
    expect(findAnchor(document.getElementById("inner"))).not.toBeNull();
  });

  it("文本节点能向上找到锚点（事件目标可能是 Text）", () => {
    document.body.innerHTML = '<a id="withText" href="/t">文字</a>';
    const text = document.getElementById("withText")?.firstChild ?? null;
    expect(findAnchor(text)?.id).toBe("withText");
  });
});

describe("时间常量", () => {
  /**
   * 必须有兜底：软导航被中断时地址不变、`pathname` 的 effect 永不触发，
   * 进度条会一直挂在顶栏上。5s 是"真实导航都远快于此"与"别让人以为卡住"的折中。
   */
  it("兜底收起是 5 秒", () => {
    expect(ROUTE_PROGRESS_TIMEOUT_MS).toBe(5000);
  });

  /**
   * 最短可见时长。
   *
   * React 把"点击时的 setState"与"pathname 更新"批处理进同一次渲染，
   * 所以没有这一条时进度条只会闪一帧——它对应的是"进度条在真实点击下
   * 看不见"这个实际发生过的 bug（`boot-bar` 前 400ms 只推进到 13%，
   * 条子刚出现就被收掉，肉眼与截图都留不下痕迹）。
   */
  it("最短可见时长是 400ms", () => {
    expect(ROUTE_PROGRESS_MIN_VISIBLE_MS).toBe(400);
  });

  it("最短可见时长必须小于兜底时长，否则计时器会互相打架", () => {
    expect(ROUTE_PROGRESS_MIN_VISIBLE_MS).toBeLessThan(ROUTE_PROGRESS_TIMEOUT_MS);
  });
});
