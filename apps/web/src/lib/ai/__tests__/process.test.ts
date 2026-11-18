import { describe, expect, it } from "vitest";
import type { AiRunEvent } from "../sse";
import {
	EMPTY_PROCESS,
	activitySummary,
	applyRunEvent,
	toolAction,
	toolResultSummary,
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
		state = applyRunEvent(state, event("reasoning.delta", { blockId: "b1", delta: "先想" }));
		state = applyRunEvent(state, event("reasoning.delta", { blockId: "b1", delta: "再想" }));
		state = applyRunEvent(state, event("reasoning.delta", { blockId: "b2", delta: "新块" }));
		state = applyRunEvent(state, event("reasoning.finished", { blockId: "b1", durationMs: 120, status: "done" }));

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
		state = applyRunEvent(state, event("reasoning.delta", { blockId: "b1", delta: "想了一半" }));
		state = applyRunEvent(
			state,
			event("reasoning.finished", { blockId: "b1", durationMs: 80, status: "interrupted" }),
		);
		const first = state.items[0];
		if (first?.type !== "reasoning") throw new Error("期望思考行");
		expect(first.status).toBe("interrupted");
	});

	it("工具行先 started 后 finished 补结果与对象标签", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(
			state,
			event("tool.started", { callId: "c1", name: "kb_search", summary: "检索知识库" }),
		);
		state = applyRunEvent(
			state,
			event("tool.started", { callId: "c2", name: "kb_read", target: { label: "指定内容", resolved: false } }),
		);
		state = applyRunEvent(
			state,
			event("tool.finished", {
				callId: "c1",
				name: "kb_search",
				status: "SUCCESS",
				durationMs: 820,
				target: { label: "期末复习", resolved: true },
				result: { count: 5, items: [{ ref: "note:12", title: "提纲" }] },
			}),
		);
		const tool = state.items.find((item) => item.type === "tool" && item.callId === "c1");
		if (!tool || tool.type !== "tool") throw new Error("期望工具行");
		expect(tool.status).toBe("SUCCESS");
		expect(tool.result?.count).toBe(5);
		expect(tool.target?.label).toBe("期末复习");
		const pending = state.items.find((item) => item.type === "tool" && item.callId === "c2");
		if (!pending || pending.type !== "tool") throw new Error("期望工具行");
		expect(pending.target?.label).toBe("指定内容");
		expect(pending.status).toBe("running");
	});

	it("过程说明与重试各自成行", () => {
		let state = EMPTY_PROCESS;
		state = applyRunEvent(state, event("step.note", { noteId: "n1", text: "先看看目录" }));
		state = applyRunEvent(state, event("model.retry", { attempt: 1 }));
		expect(state.items).toEqual([
			{ type: "note", text: "先看看目录" },
			{ type: "retry" },
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
			{ type: "reasoning", blockId: "b", text: "x", status: "done" },
			{ type: "tool", callId: "1", name: "kb_search", status: "SUCCESS" },
			{ type: "tool", callId: "2", name: "kb_read", status: "SUCCESS" },
			{ type: "tool", callId: "3", name: "kb_read", status: "SUCCESS" },
			{ type: "tool", callId: "4", name: "kb_grep", status: "SUCCESS" },
			{ type: "tool", callId: "5", name: "kb_list", status: "SUCCESS" },
		] as Parameters<typeof activitySummary>[0];
		expect(activitySummary(items)).toBe("检索 1 次、阅读 2 篇、查找 1 次");
		expect(activitySummary([])).toBeNull();
	});
});
