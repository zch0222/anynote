# 修复：笔记历史查询健壮性与参数校验

## 背景

新前端笔记历史版本页（画板 D-16 / M-13）要按 `operationId` 拉单个历史版本。
2026-09-16 核对了现有实现，有两个问题：

1. **不存在的 `operationId` 返回 500 而不是业务错误**。
   `GET /notes/history?operationId=` 在 Controller 里先 `selectById`，
   然后直接 `noteOperationLog.getNoteId()`（`NoteController.java` 原 L223-230）。
   id 不存在时 `noteOperationLog` 是 null，取 `getNoteId()` 抛 NPE，
   被全局处理器的 `Exception` 兜底分支接住，返回 `B0001 未知错误，请联系管理员`。
   历史列表是消息队列异步写快照的，前端点到一个已被清理的版本完全可能。
2. **`historyList` 的三个参数没有任何校验**。
   `noteId` / `page` / `pageSize` 都是裸 `Long` / `Integer`，
   不传时 `PageHelper.startPage(null, null)` 行为不确定，
   `pageSize` 也没有上界——传 `pageSize=100000` 就能一次性拖走全部历史。

## 契约影响

**请求与响应结构不变**，路径、参数名、`ResData` 形状都不动；
变化的是错误码与参数约束，`openapi/specs/note.json` 的 diff 仅为：

| 路径 | 变化 |
|------|------|
| `GET /notes/history` | `operationId` 由「无约束」变为 `@NotNull`；补 `@Operation` / `@Parameter` |
| `GET /notes/historyList` | `page` 变 `@NotNull @Min(1)`、`pageSize` 变 `@NotNull @Min(1) @Max(50)`；补 `@Operation` / `@Parameter` |

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| `operationId` 不存在 | `B0001 未知错误，请联系管理员`（HTTP 200，NPE 栈打到日志） | `A0404 历史版本不存在` |
| `operationId` 缺失 | `A0160 请求必填参数为空`（`ConstraintViolationException`） | 不变 |
| `historyList` 不传 `pageSize` | `PageHelper` 拿到 null，行为不确定 | `A0160 页面大小不能为空` |
| `historyList` 传 `pageSize=100000` | 全量返回 | `A0160 页面大小错误` |

## 实现

- 查找逻辑从 Controller 挪进 `NoteHistoryService#getNoteHistoryByOperationId(Long operationId)`：
  先 `selectById(operationId)` 拿 `noteId`，日志不存在时抛
  `UserParamException("历史版本不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND)`。
- `@RequiresNotePermissions(NotePermissions.READ)` 的权限语义**不变**：
  仍在 `getNoteHistory(NoteHistoryQueryParam)` 上，
  新的入口经自身代理（`@Autowired @Lazy NoteHistoryService self`）回调它，
  避免 `this.getNoteHistory(...)` 自调用让切面失效。
- Controller 的 `getNoteHistory` 只做参数校验与转发；
  `historyList` 三个参数补 `@NotNull` / `@Min` / `@Max`。
- 两个方法补 `@Operation` 与 `@Parameter`。
- **不新增回滚端点**：恢复 = 用该版本的 `title` + `content` 带当前 `version` 调
  `PATCH /notes/{noteId}`。理由见方案 §1.4 第 4 条——`PATCH` 每次保存都会异步发
  `GENERATE_NOTE_EDIT_LOG`，恢复前的内容本来就会作为新版本保留。

## 验证

- `services/note/src/test/java/com/anynote/note/service/impl/NoteHistoryServiceImplTest.java`
  3 条用例：操作日志不存在抛异常 / 正常返回 title·content·historyTime /
  分页参数透传到 `PageHelper` 的本地分页对象。
- `mvn test -pl note` 通过。
- 传不存在的 `operationId` 返回 `A0404` 业务错误，不再返回 500。
- `pnpm openapi:check` 通过。

## 后续

`@Max(50)` 对历史列表是一个偏紧的上界，取的是方案 §4 B-2 的原文。
前端 `useNoteHistoryInfinite` 每页 15 条，不受影响。
