-- 2026-11-21 Agent 运行过程展示（M17）修复
--
-- 用途：a_agent_run 新增逻辑模型绑定的供应商、模型发起的工具调用次数与首字时间，供管理端运行列表展示；
--       a_model_provider 新增过程视图思考全文的截断字数，按供应商配置。
--
-- 幂等：ADD COLUMN 无 IF NOT EXISTS 语法，重复执行前先确认列不存在。

ALTER TABLE `a_agent_run`
  ADD COLUMN `provider` varchar(64) DEFAULT NULL COMMENT '逻辑模型绑定的供应商标识' AFTER `model`,
  ADD COLUMN `tool_calls` int DEFAULT NULL COMMENT '模型发起的工具调用次数' AFTER `duration_ms`,
  ADD COLUMN `first_output_ms` bigint DEFAULT NULL COMMENT '从运行开始到首个思考或正文增量的毫秒数' AFTER `tool_calls`;

ALTER TABLE `a_model_provider`
  ADD COLUMN `process_reasoning_max_chars` int NOT NULL DEFAULT 8000
    COMMENT '过程视图思考全文的截断字数（500..200000）' AFTER `enabled`;
