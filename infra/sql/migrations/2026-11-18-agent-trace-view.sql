-- 2026-11-18 Agent 运行过程展示（M17）
--
-- 用途：a_chat_message 新增过程视图列（T1 落库与回放）；新增管理控制台访问留痕表（永久保留）。
--       Trace 与过程视图按 2026-11-18 拍板永久保留，30 天清理任务移除，a_agent_run_event 表注释同步修改。
--
-- 幂等：本脚本可重复执行（IF NOT EXISTS / 检查列存在）。
-- 注意：ADD COLUMN 无 IF NOT EXISTS 语法，重复执行前先确认列不存在。

ALTER TABLE `a_chat_message`
  ADD COLUMN `process` json DEFAULT NULL COMMENT '过程视图（思考、工具行、过程说明，读取时按当前权限复核）' AFTER `answer_notices`;

CREATE TABLE IF NOT EXISTS `a_agent_trace_access` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `run_id` varchar(64) NOT NULL COMMENT '运行标识',
  `admin_user_id` bigint unsigned NOT NULL COMMENT '查看 Trace 的系统管理员',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '查看时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_trace_access_run` (`run_id`),
  KEY `idx_agent_trace_access_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Agent 运行 Trace 管理端访问留痕（永久保留）';

-- 永久保留：去除事件表 30 天保留语义（原清理任务随本批移除）。
ALTER TABLE `a_agent_run_event`
  COMMENT='AI Agent 运行事件与 Trace（永久保留）',
  MODIFY COLUMN `content` json NOT NULL COMMENT '事件或 Trace 数据；开关开启后含回答草稿与工具参数、原始结果';
