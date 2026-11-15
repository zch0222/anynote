-- 2026-11-15 知识检索 Agent 运行记录与引用（M16.6）
--
-- 用途：为 AI 会话保存检索范围、运行标识、结果类型与结构化引用；
--       a_agent_run_event 仅保存 trace.* 与不含正文的运行元数据，保留 30 天。
--       回答正文保存在 a_chat_message.content，引用保存在 a_chat_message.citations。
--
-- 迁移手动执行；建表语句同步到 infra/sql/anynote.sql。

ALTER TABLE `a_chat_conversation`
  ADD COLUMN `scope` JSON DEFAULT NULL COMMENT '知识检索范围';

ALTER TABLE `a_chat_message`
  ADD COLUMN `run_id` varchar(64) DEFAULT NULL COMMENT '关联的 Agent 运行标识',
  ADD COLUMN `citations` JSON DEFAULT NULL COMMENT '结构化引用',
  ADD COLUMN `outcome` varchar(32) DEFAULT NULL COMMENT 'Agent 运行结果类型',
  ADD KEY `idx_run_id` (`run_id`);

CREATE TABLE IF NOT EXISTS `a_agent_run` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `run_id` varchar(64) NOT NULL COMMENT '运行标识',
  `conversation_id` bigint unsigned NOT NULL COMMENT '会话标识',
  `user_id` bigint unsigned NOT NULL COMMENT '用户标识',
  `agent_name` varchar(64) NOT NULL COMMENT 'Agent 名称',
  `agent_version` varchar(32) NOT NULL COMMENT 'Agent 版本',
  `model` varchar(128) DEFAULT NULL COMMENT '模型标识',
  `state` varchar(32) NOT NULL COMMENT '运行状态',
  `outcome` varchar(32) DEFAULT NULL COMMENT '运行结果类型',
  `token_usage` JSON DEFAULT NULL COMMENT 'Token 用量',
  `duration_ms` bigint DEFAULT NULL COMMENT '运行耗时（毫秒）',
  `started_at` datetime(3) NOT NULL COMMENT '运行开始时间',
  `finished_at` datetime(3) DEFAULT NULL COMMENT '运行结束时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_run_id` (`run_id`),
  KEY `idx_agent_run_user` (`user_id`, `run_id`),
  KEY `idx_agent_run_conversation` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI Agent 运行记录';

CREATE TABLE IF NOT EXISTS `a_agent_run_event` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `run_id` varchar(64) NOT NULL COMMENT '运行标识',
  `seq` bigint unsigned NOT NULL COMMENT '运行内事件序号',
  `type` varchar(64) NOT NULL COMMENT '事件类型',
  `content` JSON NOT NULL COMMENT '事件或 Trace 元数据，不含回答正文与引用原文',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_run_event_seq` (`run_id`, `seq`),
  KEY `idx_agent_run_event_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI Agent 运行事件与 Trace（保留 30 天）';
