# API-First 开发流程

本文档描述 Anynote 项目的 **API 契约优先（API-First）** 开发工作流。所有跨服务接口变更须先确定契约，再同步实现。

---

## 核心原则

1. **契约先行**：前后端在编码前就接口格式达成一致
2. **类型生成**：前端 TypeScript 类型从后端 OpenAPI 规范自动生成，禁止手写
3. **变更归档**：所有 API 变更记录在 `.claude/openspec/changes/`，供 AI 编程助手上下文读取

---

## 工作流程

### 场景一：前端需要新接口

```
1. 前端开发者
   └─ 在 .claude/openspec/changes/ 创建变更提案
      文件名格式：YYYY-MM-DD-<简短描述>.md

2. 双方对齐
   └─ 在提案文档中确认路径、方法、请求/响应结构

3. 后端开发者
   └─ 实现接口
   └─ Controller 方法加 @Operation(summary="...", tags="...")
   └─ 启动服务验证 Swagger UI

4. 前端开发者
   └─ pnpm openapi:generate   ← 更新 API 客户端类型
   └─ 基于新类型完成调用实现
```

### 场景二：后端主动变更接口

```
1. 后端开发者
   └─ 在 .claude/openspec/changes/ 创建变更通知文档
   └─ 标注 [Breaking Change] 若有不兼容变更

2. 前端开发者
   └─ 收到通知后运行 pnpm openapi:generate
   └─ 修复因类型变化产生的编译错误
```

---

## 变更提案模板

文件路径：`.claude/openspec/changes/YYYY-MM-DD-<描述>.md`

```markdown
# API 变更提案：<标题>

## 背景
<!-- 说明为什么需要这个 API，解决什么业务问题 -->

## 变更端点

| 方法   | 路径                     | 描述         | 变更类型        |
|--------|--------------------------|--------------|-----------------|
| GET    | /note/list               | 获取笔记列表 | 新增            |
| POST   | /note                    | 创建笔记     | 新增            |
| PATCH  | /note/{id}               | 更新笔记     | [Breaking Change] |

## 请求体示例（POST /note）

```json
{
  "title": "笔记标题",
  "content": "内容正文",
  "knowledgeBaseId": 1
}
```

## 响应体示例

```json
{
  "code": "00000",
  "msg": "操作成功",
  "data": { "id": 42 }
}
```

## 备注
<!-- 权限要求、分页参数、排序规则、注意事项等 -->
```

---

## 生成 TypeScript 客户端

```bash
# 前提：后端服务已运行（Gateway 在 :8080）
cd <monorepo-root>
pnpm openapi:generate
```

生成结果位于 `packages/api-client/src/`，包含：

- 所有接口的 TypeScript 函数
- 请求/响应 DTO 类型
- 枚举值

**注意**：`packages/api-client/src/` 为自动生成目录，不要手动修改其中文件。

---

## Swagger UI 地址

| 服务      | 地址                                    |
|-----------|-----------------------------------------|
| 聚合文档  | http://localhost:8080/swagger-ui.html   |
| 认证服务  | http://localhost:8083/swagger-ui.html   |
| 系统服务  | http://localhost:8091/swagger-ui.html   |
| 笔记服务  | http://localhost:18091/swagger-ui.html  |
| 文件服务  | http://localhost:8095/swagger-ui.html   |
| AI 服务   | http://localhost:9065/swagger-ui.html   |
| 通知服务  | http://localhost:9066/swagger-ui.html   |
| AI Python | http://localhost:8000/docs              |

---

## AI 编程助手使用说明

当 Claude Code 或 Codex 协助开发时：

- 读取 `.claude/context/backend.md` 了解后端架构
- 读取 `.claude/context/frontend.md` 了解前端架构
- 读取 `.claude/context/api-contracts.md` 了解接口规范
- 读取 `.claude/openspec/changes/` 下的提案文档了解待实现接口

AI 助手生成接口代码时，须自动：
1. 在 Controller 方法加 `@Operation(summary="...", tags="...")`
2. 响应类型使用 `ResData<T>` 包装
3. 遵循 `.claude/context/api-contracts.md` 中的命名和格式约定
