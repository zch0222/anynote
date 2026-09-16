/**
 * 任务时间窗口与可操作性判定（D-07 · D-17 · D-18 三张画板共用）。
 *
 * **全部函数都接收 `now`**，不在内部读全局时钟：这些判定的边界（未开始、
 * 刚好截止、剩余 3 天）正是单测要钉死的东西，藏在 `new Date()` 里就测不动了。
 * 页面传 `new Date()`，测试传固定时刻。
 *
 * 口径与后端对齐：`NoteTaskServiceImpl#submitNoteTask` 只在 `now > endTime` 时
 * 报「任务已经结束」、`now < startTime` 时报「任务尚未开始」。所以**恰好等于
 * 边界时刻仍然可以提交**，这里不能写成把边界排除在外的开区间。
 *
 * 本文件是纯函数模块，不 import 任何 React / feature 内部模块，
 * 这样 `schemas.ts` 也能反向复用它（避免"是否截止"出现两份实现）。
 */

const DAY = 24 * 60 * 60 * 1000;

export type TaskPhase = "upcoming" | "active" | "closed";

/** 时间状态徽标文案（D-17 图例 4）。 */
export const TASK_PHASE_TEXT: Record<TaskPhase, string> = {
  upcoming: "未开始",
  active: "进行中",
  closed: "已截止",
};

/** 判定只用到这三个字段，收结构化类型而不是 `MemberTask`，避免环形依赖。 */
export type TaskWindowInput = {
  submissionStatus?: number | null | undefined;
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
};

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * 时间窗口落在哪一段。
 *
 * 缺字段按"不设限"处理：没有开始时间就不存在"未开始"，没有截止时间就
 * 不存在"已截止"。后端这两个字段理论上必填，但旧数据里出现过 null，
 * 判定崩掉会把整个列表页打空。
 */
export function taskPhase(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  now: Date,
): TaskPhase {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const current = now.getTime();
  // 截止时间优先：窗口被填反（end < start）时以"已截止"为准，
  // 否则会永远停在 upcoming，用户连"为什么不能交"都看不出来。
  if (end !== null && current > end) return "closed";
  if (start !== null && current < start) return "upcoming";
  return "active";
}

/**
 * 剩余天数，向上取整——"还剩 1 天"要在最后 24 小时里一直成立，
 * 用 `floor` 会让最后一天显示成"还剩 0 天"。已截止返回 0。
 * 没有截止时间返回 `null`（"不限时"，不是"0 天"）。
 */ export function daysLeft(endTime: string | null | undefined, now: Date): number | null {
  const end = parseTime(endTime);
  if (end === null) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY));
}

/**
 * 任务时间窗是否仍然开放（结束时间已过则不可再提交）。
 *
 * 保留在这里而不是散在页面里：它是 `taskPhase` 的单字段特例，
 * 两者必须同时改，否则会出现"按钮能点但徽标写着已截止"。
 */
export function isTaskOpen(endTime: string | null | undefined, now: Date = new Date()): boolean {
  return taskPhase(null, endTime, now) !== "closed";
}

/** 剩余 ≤ 3 天时转 warning（D-17 图例 5）。 */
export const DAYS_LEFT_WARNING = 3;

/**
 * 能不能提交：未提交 **且** 窗口已开始、未结束。
 *
 * 后端对"尚未开始"同样拒绝（`NoteTaskServiceImpl.java:359`），所以这里必须连
 * 开始时间一起判——只判截止会让用户点了按钮才吃一个错误。
 */
export function canSubmit(task: TaskWindowInput, now: Date): boolean {
  return task.submissionStatus === 0 && taskPhase(task.startTime, task.endTime, now) === "active";
}

/**
 * 能不能重新提交：**只有「已退回」（3）**才可以。
 *
 * `status === 1`（已提交）时后端会拒绝再次提交（"你已经提交过该任务"），
 * 界面上不能再给任何提交类按钮——这正是 §1.4 第 3 条修掉的那个 bug。
 */
export function canResubmit(task: TaskWindowInput, now: Date): boolean {
  return task.submissionStatus === 3 && taskPhase(task.startTime, task.endTime, now) === "active";
}

/** 下一个整点（D-18 图例 6「默认此刻取整到下一个整点」）。 */
export function defaultStartTime(now: Date): Date {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/** 把某个时刻挪到它所在自然日的 23:59:00.000。 */
function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * 默认截止：开始 + 7 天的 23:59（D-18 图例 7）。
 *
 * 用"开始日 + 7 天的当天 23:59"而不是"开始时刻 + 7×24 小时"：
 * 用户填的是"哪天截止"，按时刻加会在夏令时切换那天算出 22:59 或 00:59。
 */
export function defaultEndTime(start: Date): Date {
  return endOfDay(addDays(start, 7));
}

export type PresetDuration = "1w" | "2w" | "1m";

/** 快捷时长胶囊（D-18 图例 8）：开始日 + 7 / 14 / 30 天的 23:59。 */
export function presetEndTime(start: Date, preset: PresetDuration): Date {
  const days = preset === "1w" ? 7 : preset === "2w" ? 14 : 30;
  return endOfDay(addDays(start, days));
}

/**
 * 完成率 = 已提交 / 应提交；**没有人需要提交时返回 `null`（不是 1）**。
 *
 * **不直接用 `AdminNoteTaskVO.submissionProgress`**：那个字段在 `need === 0` 时
 * 是 `100.0`（百分比），其余时候是 0–1 的小数（`NoteTaskServiceImpl.java:513-519`），
 * 两套量纲。直接乘 100 会让"没有人需要提交"显示成 10000%，当比例用又会让
 * 这种任务显示成 1%。这里按 `submitted / need` 现算，量纲只有一套。
 *
 * `need === 0` 早期**刻意返回 1 以避免除零**，但"空任务显示完成率 100%"会被
 * 读成"全都交了"——一件没有任何人需要交的任务没有完成率可言。返回 `null`
 * 让界面显示 `—`（见 `formatRate`），语义上"不适用"而不是"满分"。
 */
export function completionRate(
  needSubmitCount: number | null | undefined,
  submittedCount: number | null | undefined,
): number | null {
  const need = needSubmitCount ?? 0;
  const submitted = submittedCount ?? 0;
  if (need <= 0) return null;
  return Math.min(1, Math.max(0, submitted / need));
}

/**
 * 完成率文案：`null`（不适用）→ `—`，否则取整百分比。
 *
 * `—` 而不是 `0%`：两者都是"没交"，但原因不同——`0%` 是"有人要交、一个都没交"，
 * `—` 是"没有人需要交"。用同一个符号会让管理员误判任务卡住了。
 */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** `09-10 10:00` 形态；解析不出来时返回 `"—"`。 */
export function formatTaskMoment(value: string | null | undefined): string {
  const time = parseTime(value);
  if (time === null) return "—";
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 时间窗口文案：`09-10 10:00 – 09-18 23:59`（D-17 图例 5）。 */
export function formatTaskWindow(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  return `${formatTaskMoment(startTime)} – ${formatTaskMoment(endTime)}`;
}

/**
 * 移动端列表的时间窗口：`09-10 ~ 09-18`（M-04 图例原文）。
 *
 * 与 `formatTaskWindow` 的差别不只是长短：列表行里一行要放"窗口 + 发布人"，
 * 完整时分在这个宽度下会被截断，而**日期才是判断"来不来得及"的量纲**——
 * 23:59 截止还是 09:00 截止，在扫列表这一步不影响决策。
 * 两端都取不到时返回 `—`（调用方直接渲染）。
 */
export function formatTaskWindowShort(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const short = (value: string | null | undefined): string => {
    const moment = formatTaskMoment(value);
    // formatTaskMoment 解析失败时给 `—`，这里要把它透传出去而不是切成半截
    return moment === "—" ? moment : moment.slice(0, 5);
  };
  const from = short(startTime);
  const to = short(endTime);
  if (from === "—" && to === "—") return "—";
  return `${from} ~ ${to}`;
}

/** 剩余天数文案；已截止返回「已截止」，不限时返回空串。 */
export function daysLeftText(endTime: string | null | undefined, now: Date): string {
  if (taskPhase(null, endTime, now) === "closed") return "已截止";
  const days = daysLeft(endTime, now);
  return days === null ? "" : `还剩 ${days} 天`;
}
