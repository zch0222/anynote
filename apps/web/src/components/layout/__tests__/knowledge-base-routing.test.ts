import { parseBaseIdFromPath } from "@/components/layout/app-header";
import {
  knowledgeBaseSectionHref,
  knowledgeBaseSections,
  parseKnowledgeBaseSection,
} from "@/components/layout/navigation";
import { describe, expect, it } from "vitest";

describe("知识库二级 Tab 路由", () => {
  it("笔记是默认落地页，走裸路径；其余各占一段", () => {
    expect(knowledgeBaseSectionHref(12, "notes")).toBe("/notes/12");
    expect(knowledgeBaseSectionHref(12, "overview")).toBe("/notes/12/overview");
    expect(knowledgeBaseSectionHref(12, "mooc")).toBe("/notes/12/mooc");
    expect(knowledgeBaseSectionHref(12, "tasks")).toBe("/notes/12/tasks");
    expect(knowledgeBaseSectionHref(12, "docs")).toBe("/notes/12/docs");
    expect(knowledgeBaseSectionHref(12, "members")).toBe("/notes/12/members");
  });

  it("每个段名都能被反解回自己（路由段与 Tab key 同构）", () => {
    for (const section of knowledgeBaseSections) {
      // 把 href 的最后一段取出来，交给反解函数
      const href = knowledgeBaseSectionHref(7, section.key);
      const last = href.split("/").at(-1);
      const segment = last === "7" ? undefined : last;
      expect(parseKnowledgeBaseSection(segment)).toBe(section.key);
    }
  });

  it("未知段名回退到笔记，而不是 undefined", () => {
    expect(parseKnowledgeBaseSection("nonsense")).toBe("notes");
    expect(parseKnowledgeBaseSection(undefined)).toBe("notes");
  });

  it("段名都是静态词，不会与数字 noteId 互抢路由", () => {
    // Next 的静态段优先于 [noteId]，但前提是它们**不是**纯数字
    for (const section of knowledgeBaseSections) {
      if (section.key === "notes") continue;
      expect(Number.isNaN(Number(section.key))).toBe(true);
    }
  });
});

describe("从路径解析知识库 id", () => {
  it("知识库下的各层路径都能取到 id", () => {
    expect(parseBaseIdFromPath("/notes/12")).toBe(12);
    expect(parseBaseIdFromPath("/notes/12/overview")).toBe(12);
    expect(parseBaseIdFromPath("/notes/12/tasks")).toBe(12);
    expect(parseBaseIdFromPath("/notes/12/345")).toBe(12);
  });

  it("不在知识库下时返回 null", () => {
    expect(parseBaseIdFromPath("/notes")).toBeNull();
    expect(parseBaseIdFromPath("/notes/new")).toBeNull();
    expect(parseBaseIdFromPath("/dashboard")).toBeNull();
    expect(parseBaseIdFromPath("/ai/chat")).toBeNull();
  });

  it("非法 id 当作不在知识库下", () => {
    expect(parseBaseIdFromPath("/notes/0")).toBeNull();
    expect(parseBaseIdFromPath("/notes/-1")).toBeNull();
    expect(parseBaseIdFromPath("/notes/abc")).toBeNull();
    expect(parseBaseIdFromPath("/notes/12abc")).toBeNull();
  });

  it("不会把 /notes-new 这类同前缀路径误判成知识库", () => {
    expect(parseBaseIdFromPath("/notes-new/12")).toBeNull();
    expect(parseBaseIdFromPath("/notesx/12")).toBeNull();
  });
});
