-- 2026-11-27 Agent 运行管理统计索引（M20.0）
--
-- 用途：为管理端运行统计与按时间范围筛选补齐 started_at + outcome 联合索引。
-- 幂等：通过 information_schema.STATISTICS 判断后动态执行，可重复运行。

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'a_agent_run'
    AND INDEX_NAME = 'idx_agent_run_started_outcome'
);

SET @add_index_sql := IF(
  @index_exists = 0,
  'ALTER TABLE `a_agent_run` ADD INDEX `idx_agent_run_started_outcome` (`started_at`, `outcome`)',
  'SELECT 1'
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;
