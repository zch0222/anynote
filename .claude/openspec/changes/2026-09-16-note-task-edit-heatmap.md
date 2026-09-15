# 新增：任务成员编辑热力图端点

## 背景

新前端任务详情页（画板 D-17「成员编辑活跃度」）要画「成员 × 日期」的编辑热力图。
现有的 `GET /noteTasks/{id}/charts` 不能直接用，2026-09-16 核对出三个问题：

1. **没有提交时直接空指针**。`selectNoteTaskSubmissionTime` 在没有任何提交时
   `MIN()` / `MAX()` 都返回 null，`NoteTaskServiceImpl#getNoteTaskChartsData` 紧接着调
   `DateUtils.roundDownToHour(null)`，`Calendar.setTime(null)` 抛 NPE，端点返回 500。
2. **区间是提交笔记的全部编辑历史**，不是任务时间窗口，画出来的列会超出任务起止。
3. **按小时逐段查询**：`while` 循环里每小时查一次 `selectNoteTaskCharts`，
   一学期长度的任务就是几千次往返。

旧前端仍在用 charts，所以返回结构不改，只在 B-1 里补空数据防护。

## 契约

```
GET /admin/noteTasks/{id}/editHeatmap
权限：@RequiresNoteTaskPermissions(NoteTaskPermissions.MANAGE)（与 charts 相同）

ResData<NoteTaskEditHeatmapVO>
NoteTaskEditHeatmapVO {
  startDate: string        // yyyy-MM-dd，任务开始日
  endDate:   string        // yyyy-MM-dd，任务截止日
  today:     string        // yyyy-MM-dd，服务端当天；前端据此把之后的列画成「未到」
  days:      string[]      // startDate..endDate 逐日；超过 62 天时只取截至 min(endDate, today) 的最后 62 天
  members: [{
    userId: long, username: string, nickname: string, noteId: long,
    total:  int,           // 窗口内编辑总次数
    counts: int[]          // 与 days 等长，未编辑为 0
  }]                       // 只含状态正常的提交（record.status = 0），按 total 降序
}
```

`days` 上限 62 天是**响应体积与表格宽度的硬约束**：成员多、窗口长时表格过宽、
渲染慢（方案 §9 风险表）。超过 62 天时取「截至今天」的最后 62 天，
把最相关的近期数据留下，而不是截掉最近的一段。

## 实现

- `AdminNoteTaskController` 新增方法，写 `@Operation` / `@Parameter`。
- `NoteTaskService#getNoteTaskEditHeatmap(NoteTaskEditHeatmapQueryParam)`：
  1. 查任务的 `startTime` / `endTime`；任务不存在时抛
     `UserParamException("任务不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND)`。
  2. 算出 `days`；实际查询区间 = `[days[0] 00:00, min(endTime, now) 次日 00:00)`。
  3. 执行 `selectNoteTaskEditHeatmap`（一条 SQL，按天聚合）+
     `selectNoteTaskSubmitMembers`（已提交成员名单），在内存里铺成 `members × days` 矩阵。
- 入参用 `NoteTaskEditHeatmapQueryParam extends NoteTaskQueryParam`：
  `RequiresNoteTaskPermissionsAspect` 从第一个入参取 `noteTaskId`，
  继承才能复用与 charts / operationCounts 相同的权限路径。
- `getNoteTaskChartsData` 的空数据防护：`earliestTime` 为空（或整行为 null）时返回空列表。

### SQL

```sql
SELECT r.user_id, u.username, u.nickname, r.note_id,
       DATE(l.operation_time) AS edit_date, COUNT(*) AS edit_count
FROM n_note_task_submission_record r
JOIN n_note_operation_log l ON l.note_id = r.note_id AND l.operation_type = 1   -- NoteOperationType.EDIT
JOIN sys_user u ON u.id = r.user_id
WHERE r.note_task_id = #{noteTaskId}
  AND r.status = 0 AND r.is_delete = 0
  AND l.operation_time >= #{rangeStart} AND l.operation_time < #{rangeEnd}
  AND l.is_delete = 0
GROUP BY r.user_id, u.username, u.nickname, r.note_id, DATE(l.operation_time)
```

`l.is_delete = 0` 是相对方案原文补的条件：`n_note_operation_log` 有逻辑删除列，
被删掉的编辑不该计入活跃度。

「已提交但窗口内一次都没编辑」的成员不会出现在上面这条 GROUP BY 结果里，
因此单独查一次 `selectNoteTaskSubmitMembers`（`r.status = 0` 的提交人清单），
先把这些人铺成 counts 全 0 的行，再合并逐日计数。

## 验证

- `services/note/src/test/java/com/anynote/note/service/impl/NoteTaskServiceImplEditHeatmapTest.java`
  8 条用例：无提交 / 两名成员跨三天编辑 / 已提交但窗口无编辑 / 90 天窗口今天是第 80 天 /
  任务未开始 / 任务不存在抛异常 / charts 无提交返回空列表 / charts 整行为 null 返回空列表。
- `mvn test -pl note` 通过。
- `openapi/specs/note.json` 出现新路径，`pnpm openapi:check` 无漂移。

## 后续

- 前端 `useTaskHeatmapQuery(taskId)` 消费这个端点；B-1 上线前整卡隐藏，
  **不回退到旧 charts 端点**（方案 §3.3 表）。
- 表格超过 12 行时前端用 `collapseMembers` 折叠，后端不设行数上限：
  一个知识库的提交人数就是行的上界，通常远小于分页阈值。
