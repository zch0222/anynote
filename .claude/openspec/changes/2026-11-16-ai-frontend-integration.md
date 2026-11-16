# API 变更提案：M16.7 前端接入

关联：[M16.7](../../../docs/ai-refactor/AI_MILESTONES.md)、[运行契约](2026-11-15-ai-agent-runs.md)。

## 已确认范围（2026-11-16）

- 聊天支持全部知识库或单个知识库，每轮可切换，运行期间禁用；知识库入口预选该库。
- 会话详情 `conversation.scope` 返回结构化 `AgentRunScopeDTO`，恢复会话时保留范围；PDF 问答固定当前资料。
- 内部 `/internal/v1/knowledge/authorize` 的可读条目增加 `moocId`，来源为权威实体的属性；不可读条目不返回该值。Python 将它并入引用 `locator.moocId`，供桌面和移动端生成慕课路由。
- 引用跳到笔记小节、PDF 页码或视频时间；定位缺失时打开来源首页，无法生成来源链接时仅展示信息。
- 真实栈复现 PDF 预览地址为对象键而非 HTTP URL：`GET /docs/{id}` 在既有资料 READ 权限校验后，通过新增的 `GET /internal/v1/files/{fileId}/doc-preview-url` 获取签名地址。内部端点要求 HMAC `@InnerAuth`，只签发 `KNOWLEDGE_BASE_DOC` 来源文件；公开文件端点的本人归属规则不变。`DocVO.fileId` 经既有 XML `resultMap` 映射，`url` 返回浏览器可用地址；签名失败复用已确认的“服务暂时不可用，请稍后重试”。
- 新增文案已由用户整组确认：检索范围、全部知识库、当前资料、知识库问答；加载中…、暂无可选知识库、知识库加载失败，请重试、重试；正在准备、正在搜索、正在阅读、正在生成回答、已取消；引用来源、查看引用 {编号}、未命名来源；模型生成、索引滞后、转写内容；第 {页码} 页；已索引、索引构建中、索引失败、未索引、无法提取文本、状态未知。运行错误与未找到复用 M16.6 已确认文案，工具摘要沿用七种已确认说明。

## 验证

关键逻辑在宿主机运行 Java、Python、Vitest 单测；真实栈端到端使用本机 Docker 脚本化供应商及真实 Java/Python/MySQL/Elasticsearch 链路，不调用外部付费模型。更新 Springdoc baseline 并从 baseline 生成客户端，执行 M16.7 要求的全仓测试、类型、格式与产物预算门禁。
