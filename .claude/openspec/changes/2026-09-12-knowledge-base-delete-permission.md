# 修复：知识库删除权限判断写反

## 背景

`DELETE /api/note/bases/{id}` 的权限判断漏了取反：

```java
// 修复前
if (knowledgeBase.getCreateBy().equals(loginUser.getUserId())) {
    throw new BusinessException("没有权限删除知识库");
}
```

后果有两个方向：

1. **创建者永远删不掉自己的知识库**——命中判断直接抛「没有权限删除知识库」。
2. **任何非创建者都能删别人的知识库**——判断不成立就放行，没有其它权限检查兜底。

这是 2026-09-12 实施 `apps/cli` 时、跑知识库增删改查端到端流程发现的：
`base rm` 在真实栈上必定失败。

## 契约影响

**请求与响应结构不变**，路径、DTO、`ResData` 形状都不动；变化的只是权限语义，
因此 `openapi/specs/note.json` 不产生 diff。

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 创建者删除自己的知识库 | `B0001 没有权限删除知识库` | 成功，`data: "SUCCESS"` |
| 非创建者删除别人的知识库 | **成功删除** | `B0001 没有权限删除知识库` |
| 知识库不存在 | `B0001 知识库不存在` | 不变 |
| 影响行数不为 1 | `B0001 删除知识库失败` | 不变 |

## 实现

`services/note/.../KnowledgeBaseServiceImpl#deleteKnowledgeBaseById` 的判断加上取反，
并保留原有的存在性检查与影响行数校验。

## 验证

先写复现用例再改代码：

- `services/note/src/test/java/com/anynote/note/service/impl/KnowledgeBaseServiceImplDeleteTest.java`
  4 条用例（创建者可删、非创建者被拒且不落库、知识库不存在、影响行数不符）。
  修复前 3 条失败，修复后全绿。
- 真实栈复验：重建 note 镜像并重启容器后，创建者删除自己的知识库返回 `00000`，
  再查返回 `A0404`。
- `apps/cli/e2e/cli.live.test.ts` 的「创建者可以删除自己的知识库」把这条回归钉住。

## 后续

非创建者的删除权限目前完全按 `create_by` 判定，没有引入 `UserKnowledgeBase` 的
管理员级权限。若后续要支持"知识库管理员也能删"，需要另开提案明确权限级别。
