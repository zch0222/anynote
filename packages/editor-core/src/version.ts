/**
 * 编辑器 schema 与 Markdown 规则的版本号。
 *
 * web 与协同服务打包同一份 `@anynote/editor-core`；协同握手时比较两侧的版本号，
 * 不相等就拒绝连接（关闭码 4426），防止新旧两侧互相写入对方不认识的节点。
 *
 * 任何会改变 schema（节点、mark、属性、content 表达式）或 Markdown 规则的改动都必须递增它，
 * 并在 `schema-lock.json` 里登记新的摘要；`schema-version.test.ts` 会检查这一点。
 */
export const EDITOR_SCHEMA_VERSION = 1;
