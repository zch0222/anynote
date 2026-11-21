import { describe, expect, it } from "vitest";
import type { AiRunEvent } from "../sse";
import {
	EMPTY_PROCESS,
	activitySummary,
	applyRunEvent,
	completedHead,
	formatSeconds,
	readResultItems,
	toolAction,
	toolResultSummary,
	toolTrailing,
} from "../process";

/**
 * 构造一条运行事件。
 *
 * @param type 事件类型
 * @param data 事件数据
 * @returns 运行事件
 */
function event(type: string, data: Record<string, unknown>): AiRunEvent {
	return { seq: 1, runId: "run-1", ts: "2026-11-19T00:00:00Z", type, data };
}

describe("运行过程事件归并", () => {
	it("思考增量合并进同块，结束时补状态与耗时", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(state, event("reasoning.delta", { id: "b1", delta: "先想" }));
		state = applyRunEvent(state, event("reasoning.delta", { id: "b1", delta: "再想" }));
		state = applyRunEvent(state, event("reasoning.delta", { id: "b2", delta: "新块" }));
		state = applyRunEvent(state, event("reasoning.finished", { id: "b1", durationMs: 120, status: "done" }));

		expect(state.active).toBe(true);
		expect(state.items).toHaveLength(2);
		const first = state.items[0];
		if (first?.type !== "reasoning") throw new Error("期望思考行");
		expect(first.text).toBe("先想再想");
		expect(first.status).toBe("done");
		expect(first.durationMs).toBe(120);
	});

	it("中断的思考块标记 interrupted 并保留已收文本", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(state, event("reasoning.delta", { id: "b1", delta: "想了一半" }));
		state = applyRunEvent(
			state,
			event("reasoning.finished", { id: "b1", durationMs: 80, status: "interrupted" }),
		);
		const first = state.items[0];
		if (first?.type !== "reasoning") throw new Error("期望思考行");
		expect(first.status).toBe("interrupted");
	});

	it("工具行先 started 后 finished 补结果与对象标签", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(
			state,
			event("tool.started", { id: "c1", name: "kb_search", summary: "检索知识库" }),
		);
		state = applyRunEvent(
			state,
			event("tool.started", { id: "c2", name: "kb_read", target: { label: "指定内容", resolved: false } }),
		);
		state = applyRunEvent(
			state,
			event("tool.finished", {
				id: "c1",
				name: "kb_search",
				status: "SUCCESS",
				durationMs: 820,
				target: { label: "期末复习", resolved: true },
				result: { count: 5, items: [{ ref: "note:12", title: "提纲" }] },
			}),
		);
		const tool = state.items.find((item) => item.type === "tool" && item.id === "c1");
		if (!tool || tool.type !== "tool") throw new Error("期望工具行");
		expect(tool.status).toBe("SUCCESS");
		expect(tool.result?.count).toBe(5);
		expect(tool.target?.label).toBe("期末复习");
		const pending = state.items.find((item) => item.type === "tool" && item.id === "c2");
		if (!pending || pending.type !== "tool") throw new Error("期望工具行");
		expect(pending.target?.label).toBe("指定内容");
		expect(pending.status).toBe("running");
	});

	it("过程说明与重试各自成行", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(state, event("step.note", { id: "n1", text: "先看看目录" }));
		state = applyRunEvent(state, event("model.retry", { id: "r1", attempt: 2 }));
		expect(state.items).toEqual([
			{ type: "note", id: "n1", text: "先看看目录" },
			{ type: "retry", id: "r1" },
		]);
	});

	it("非过程事件不改变状态", () => {
		const state = applyRunEvent(EMPTY_PROCESS, event("text.delta", { delta: "回答" }));
		expect(state).toBe(EMPTY_PROCESS);
	});
});

describe("过程文案", () => {
	it("动作与结果摘要使用已确认文案", () => {
		expect(toolAction("kb_search")).toBe("检索知识库");
		expect(toolAction("unknown_tool")).toBe("unknown_tool");
		expect(toolResultSummary("kb_search", { count: 5, items: [] })).toBe("命中 5 条");
		expect(toolResultSummary("kb_grep", { count: 3, items: [] })).toBe("命中 3 处");
		expect(toolResultSummary("kb_read", { count: 5300, items: [] })).toBe("读取 5300 字");
		expect(toolResultSummary("kb_read", undefined)).toBeNull();
	});

	it("活动摘要只统计检索、阅读与查找", () => {
		const items = [
			{ type: "reasoning", id: "b", text: "x", status: "done" },
			{ type: "tool", id: "1", name: "kb_search", status: "SUCCESS" },
			{ type: "tool", id: "2", name: "kb_read", status: "SUCCESS" },
			{ type: "tool", id: "3", name: "kb_read", status: "SUCCESS" },
			{ type: "tool", id: "4", name: "kb_grep", status: "SUCCESS" },
			{ type: "tool", id: "5", name: "kb_list", status: "SUCCESS" },
		] as Parameters<typeof activitySummary>[0];
		expect(activitySummary(items)).toBe("检索 1 次、阅读 2 篇、查找 1 次");
		expect(activitySummary([])).toBeNull();
	});
});

describe("过程区运行指标与工具行尾部", () => {
	it("秒数保留一位小数", () => {
		expect(formatSeconds(820)).toBe("0.8 秒");
		expect(formatSeconds(1250)).toBe("1.3 秒");
		expect(formatSeconds(0)).toBe("0.0 秒");
	});

	it("完成行依次带总用时、首字时间、工具调用次数与活动摘要，没有的项不显示", () => {
		const items = [
			{ type: "tool", id: "1", name: "kb_search", status: "SUCCESS" },
		] as Parameters<typeof completedHead>[3];
		expect(completedHead(18230, 1200, 3, items)).toBe(
			"已完成，用时 18 秒 · 首字 1.2 秒 · 工具调用 3 次 · 检索 1 次",
		);
		expect(completedHead(18230, undefined, undefined, [])).toBe("已完成，用时 18 秒");
		expect(completedHead(undefined, undefined, 0, [])).toBe("已完成，用时 0 秒 · 工具调用 0 次");
	});

	it("工具行尾部：成功显示摘要与耗时，失败显示失败标识与耗时，都没有时为空", () => {
		expect(
			toolTrailing({
				type: "tool",
				id: "1",
				name: "kb_search",
				status: "SUCCESS",
				durationMs: 820,
				result: { count: 5, items: [] },
			}),
		).toBe("命中 5 条 · 0.8 秒");
		expect(
			toolTrailing({ type: "tool", id: "2", name: "kb_read", status: "FAILED", durationMs: 300 }),
		).toBe("失败 · 0.3 秒");
		expect(toolTrailing({ type: "tool", id: "3", name: "kb_list", status: "SUCCESS" })).toBeNull();
	});

	it("结果条目只保留登记字段", () => {
		expect(
			readResultItems([
				{ ref: "note:12", title: "提纲", kbName: "课程库", kbId: 3, locator: { heading: "2.1" }, score: 1 },
				"bad",
			]),
		).toEqual([{ ref: "note:12", title: "提纲", kbName: "课程库", kbId: 3, locator: { heading: "2.1" } }]);
	});
});
