# OpenSpec 使用说明

本目录用于管理 Anynote 项目的 **API-First 开发规范**，供 Claude Code、Codex 等 AI 编程助手在辅助开发时使用。

---

## 目录结构

```
.claude/openspec/
├── README.md        ← 本文件，使用说明
└── changes/         ← API 变更提案归档
    └── <日期>-<描述>.md
```

---

## 工作流程

### 前端发起新 API 需求

1. 在 `changes/` 下创建变更文档，文件名格式：`YYYY-MM-DD-<简短描述>.md`
2. 文档内容参考下方模板
3. 通知后端开发者实现
4. 后端实现后运行 `pnpm openapi:generate` 更新前端类型

### 变更文档模板

```markdown
# API 变更提案：<标题>

## 背景
<!-- 说明为什么需要这个 API -->

## 需要的端点

| 方法   | 路径                        | 描述         |
|--------|-----------------------------|--------------|
| GET    | /api/v1/notes               | 获取笔记列表  |
| POST   | /api/v1/notes               | 创建笔记      |

## 请求体示例（POST）

```json
{
  "title": "笔记标题",
  "content": "内容",
  "knowledgeBaseId": 1
}
```

## 响应体示例

```json
{
  "code": "00000",
  "data": { "id": 42 }
}
```

## 备注
<!-- 权限、分页、排序等特殊说明 -->
```

---

## 当前 API 文档入口

| 服务      | Swagger UI 地址                          |
|-----------|------------------------------------------|
| 聚合文档  | http://localhost:8080/swagger-ui.html    |
| 认证服务  | http://localhost:8083/swagger-ui.html    |
| 系统服务  | http://localhost:8091/swagger-ui.html    |
| 笔记服务  | http://localhost:18091/swagger-ui.html   |
| 文件服务  | http://localhost:8095/swagger-ui.html    |
| AI 服务   | http://localhost:9065/swagger-ui.html    |
| 通知服务  | http://localhost:9066/swagger-ui.html    |
| AI Python | http://localhost:8000/docs               |

---

## 生成 TypeScript 客户端

```bash
# 在 monorepo 根目录执行
pnpm openapi:generate

# 生成结果位于
# packages/api-client/src/
```

生成脚本：`openapi/generate.sh`
