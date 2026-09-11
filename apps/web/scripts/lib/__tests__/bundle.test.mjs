import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGETS,
  MARKERS,
  ancestorLayouts,
  classifyChunk,
  evaluateBudgets,
  formatKb,
  sumEditorChunks,
  summarizeRoutes,
  toRoutePath,
} from "../bundle.mjs";

describe("classifyChunk", () => {
  it("按标志字符串识别子系统，可同时命中多个", () => {
    expect(classifyChunk("... anynote-toolbar ... prosemirror ...")).toEqual([
      "编辑器",
      "ProseMirror",
    ]);
  });

  it("协同相关 chunk 能被识别出来（M8.1 新增）", () => {
    expect(classifyChunk("new WebsocketProvider // y-websocket")).toContain("协同");
    expect(classifyChunk("collaboration-carets__caret")).toContain("协同");
  });

  it("无命中时返回空数组", () => {
    expect(classifyChunk("console.log(1)")).toEqual([]);
  });

  it("可注入自定义标志表", () => {
    expect(classifyChunk("needle", { 自定义: ["needle"] })).toEqual(["自定义"]);
    expect(Object.keys(MARKERS)).toContain("编辑器");
  });
});

describe("toRoutePath", () => {
  it("剥掉 /page 后缀与路由组括号", () => {
    expect(toRoutePath("/(workspace)/docs/page")).toBe("/docs");
    expect(toRoutePath("/(workspace)/notes/[baseId]/[noteId]/page")).toBe(
      "/notes/[baseId]/[noteId]",
    );
    expect(toRoutePath("/(auth)/login/page")).toBe("/login");
  });

  it("根路由归一成 /", () => {
    expect(toRoutePath("/page")).toBe("/");
  });
});

describe("ancestorLayouts", () => {
  const layouts = ["/layout", "/(workspace)/layout", "/(auth)/layout"];

  it("命中根 layout 与所在路由组的 layout", () => {
    expect(ancestorLayouts("/(workspace)/docs/page", layouts)).toEqual([
      "/layout",
      "/(workspace)/layout",
    ]);
  });

  it("不会把兄弟路由组的 layout 算进来", () => {
    expect(ancestorLayouts("/(auth)/login/page", layouts)).toEqual(["/layout", "/(auth)/layout"]);
  });

  it("根页面只套根 layout", () => {
    expect(ancestorLayouts("/page", layouts)).toEqual(["/layout"]);
  });

  it("前缀相近的路由组不误判（(workspace) vs (workspace-x)）", () => {
    expect(ancestorLayouts("/(workspace-x)/a/page", ["/(workspace)/layout"])).toEqual([]);
  });
});

describe("summarizeRoutes", () => {
  const manifest = {
    pages: {
      "/layout": ["static/chunks/framework.js", "static/chunks/main.js"],
      "/(workspace)/layout": ["static/chunks/framework.js", "static/chunks/shell.js"],
      "/(workspace)/docs/page": ["static/chunks/docs.js"],
      "/(workspace)/notes/page": ["static/chunks/notes.js", "static/chunks/shell.js"],
      "/api/proxy/[...path]/route": ["static/chunks/never-counted.js"],
    },
  };
  const sizes = {
    "static/chunks/framework.js": 50,
    "static/chunks/main.js": 30,
    "static/chunks/shell.js": 20,
    "static/chunks/docs.js": 10,
    "static/chunks/notes.js": 5,
    "static/chunks/never-counted.js": 9_999,
  };

  it("首屏体积 = 页面 chunk ∪ 各级 layout chunk（共享 chunk 只算一次）", () => {
    const routes = summarizeRoutes(manifest, sizes);
    const docs = routes.find((route) => route.route === "/docs");
    // framework(50) + main(30) + shell(20) + docs(10)，framework 出现在两个 layout 里只算一次
    expect(docs?.gzip).toBe(110);
  });

  it("页面自身重复引用 layout chunk 也只算一次", () => {
    const notes = summarizeRoutes(manifest, sizes).find((route) => route.route === "/notes");
    expect(notes?.gzip).toBe(105);
  });

  it("layout 自身不作为一条路由出现", () => {
    const routes = summarizeRoutes(manifest, sizes).map((route) => route.route);
    expect(routes).not.toContain("/layout");
    expect(routes).toEqual(["/docs", "/notes"]);
  });

  it("API 路由不计入（不产出前端 JS，否则会污染最大值）", () => {
    const routes = summarizeRoutes(manifest, sizes);
    expect(routes.every((route) => route.gzip < 9_999)).toBe(true);
  });

  it("按体积降序排列，便于直接取最重的一条", () => {
    const routes = summarizeRoutes(manifest, sizes);
    expect(routes[0]?.route).toBe("/docs");
  });

  it("manifest 里没有的文件按 0 计，不会 NaN", () => {
    const routes = summarizeRoutes(manifest, {});
    expect(routes.every((route) => route.gzip === 0)).toBe(true);
  });

  it("空 manifest 返回空列表", () => {
    expect(summarizeRoutes({}, {})).toEqual([]);
  });
});

describe("sumEditorChunks", () => {
  it("只累加命中「编辑器」的 chunk", () => {
    const rows = [
      { gzip: 100, hits: ["编辑器", "ProseMirror"] },
      { gzip: 50, hits: ["编辑器"] },
      { gzip: 999, hits: ["KaTeX"] },
    ];
    expect(sumEditorChunks(rows)).toBe(150);
  });

  it("没有编辑器 chunk 时为 0", () => {
    expect(sumEditorChunks([{ gzip: 10, hits: [] }])).toBe(0);
  });
});

describe("evaluateBudgets", () => {
  it("两项都在预算内时整体通过", () => {
    const result = evaluateBudgets({
      initialJs: 200 * 1024,
      heaviestRoute: "/notes",
      editorChunk: 10 * 1024,
    });
    expect(result.pass).toBe(true);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("首屏 JS 超标时整体失败，并带上是哪条路由", () => {
    const result = evaluateBudgets({
      initialJs: 315 * 1024,
      heaviestRoute: "/docs",
      editorChunk: 10 * 1024,
    });
    expect(result.pass).toBe(false);
    expect(result.checks[0]).toMatchObject({ pass: false, detail: "/docs" });
    expect(result.checks[1]?.pass).toBe(true);
  });

  it("编辑器 chunk 超标时整体失败", () => {
    const result = evaluateBudgets({ initialJs: 1, heaviestRoute: "/", editorChunk: 300 * 1024 });
    expect(result.pass).toBe(false);
  });

  it("正好等于预算算通过（预算是上限而非开区间）", () => {
    const result = evaluateBudgets({
      initialJs: DEFAULT_BUDGETS.initialJs,
      heaviestRoute: "/",
      editorChunk: DEFAULT_BUDGETS.editorChunk,
    });
    expect(result.pass).toBe(true);
  });

  it("预算值与 M8.3 里程碑一致", () => {
    expect(DEFAULT_BUDGETS.initialJs).toBe(300 * 1024);
    expect(DEFAULT_BUDGETS.editorChunk).toBe(250 * 1024);
  });

  it("可传入自定义预算", () => {
    const result = evaluateBudgets(
      { initialJs: 100, heaviestRoute: "/", editorChunk: 100 },
      { initialJs: 50, editorChunk: 50 },
    );
    expect(result.pass).toBe(false);
  });
});

describe("formatKb", () => {
  it("按 KB 保留一位小数", () => {
    expect(formatKb(1024)).toBe("1.0 KB");
    expect(formatKb(0)).toBe("0.0 KB");
    expect(formatKb(315 * 1024 + 100)).toBe("315.1 KB");
  });
});
