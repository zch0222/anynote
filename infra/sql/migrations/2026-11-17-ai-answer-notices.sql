-- 2026-11-17 知识库 Agent 版本 3 回答标注
--
-- 用途：在助手消息中保存 UNSOURCED、NOT_FROM_KNOWLEDGE、CITATIONS_REMOVED 标注。
-- 迁移手动执行；建表语句同步到 infra/sql/anynote.sql。

ALTER TABLE `a_chat_message`
  ADD COLUMN `answer_notices` JSON DEFAULT NULL COMMENT '回答标注' AFTER `citations`;
