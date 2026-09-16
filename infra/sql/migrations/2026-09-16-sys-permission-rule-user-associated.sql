-- 2026-09-16 修复 sys_permission_rule 的列缺失（UI 补稿 M12 验收阻塞项）
--
-- 背景：`SysPermissionRule`（services/api/anynote-api-system）声明了两个字段
--   @TableField("is_user_associated")  private Integer userAssociated;
--                                      private String  userAssociatedTableName;
-- 但 `infra/sql/anynote.sql` 与 `infra/sql/sys_permission_rule.sql` 的建表语句里
-- 都没有这两列，线上库同样没有。后果是**所有需要权限规则的端点全线 500 / B0001**：
--
--   SELECT ... is_user_associated AS userAssociated, user_associated_table_name ...
--   FROM sys_permission_rule
--   → SQLSyntaxErrorException: Unknown column 'is_user_associated' in 'field list'
--
-- 最先撞上的是 `n:mooc:read`：`GET /moocs/{id}`、`GET /moocs/items/{id}`、
-- `GET /moocs/items` 全部失败，表现是「获取SysPermissionRule：n:mooc:read失败」。
-- 这是 M7.6 第 3 条登记的「慕课条目权限规则缺失」，此前被当成**数据缺失**，
-- 实际根因是**列缺失**——规则数据一直都在（id 5–8）。
--
-- 影响面不止慕课：`ndoc:read`、`a:chatConversation:*` 走同一条查询，
-- 同样取不到规则。所以修的是基础设施，不是某一条规则。
--
-- 语义：`is_user_associated` = 该实体是否还有一张「用户 × 资源」关联表（0 没有 / 1 有）。
-- 现有 8 条规则都是「实体表上直接带 knowledge_base_id」的一对一形态，
-- 没有用户关联表，所以一律填 0、表名留空串，与 `association_table_name` 的默认值一致。
--
-- 幂等：重复执行安全（列已存在时跳过）。MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，
-- 所以用 information_schema 判断后再走 prepared statement。
--
-- 建表语句已同步（本次一次性改齐 4 个文件，避免"只修本机、新环境照旧踩坑"）：
--
--   infra/sql/anynote.sql                                  CREATE TABLE 补两列
--   infra/sql/sys_permission_rule.sql                      CREATE TABLE 补两列 + INSERT 补值
--   infra/docker/mysql/init/source/anynote.sql             同上（容器 init 真正加载的那份）
--   infra/docker/mysql/init/source/sys_permission_rule.sql 同上
--
-- 为什么是 4 个而不是 2 个：`infra/sql/` 是本文件所在的手工执行目录（README 的约定），
-- 但**容器初始化只挂载 `infra/docker/mysql/init/`**（见 compose 的
-- `/docker-entrypoint-initdb.d` 与其中的 `00-import-sql.sh`），它加载的是
-- `init/source/` 下的另一份**逐字节相同的副本**。只改其中一处，另一个入口就照旧漂移。
--
-- `sys_permission_rule.sql` 用的是**位置式 INSERT**（`INSERT INTO ... VALUES (...)`，
-- 不带列名），所以加列必须同时给 8 条元组各补两个值，否则重建库会因列数与值数
-- 不等而直接失败。两处副本都已用 md5 校验逐字节一致。

SET @db := DATABASE();

-- 1) is_user_associated
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_permission_rule'
    AND COLUMN_NAME = 'is_user_associated'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `sys_permission_rule`
     ADD COLUMN `is_user_associated` tinyint NOT NULL DEFAULT 0
     COMMENT ''是否有用户资源关联表(0表示没有，1表示有)'' AFTER `association_table_name`',
  'SELECT ''is_user_associated 已存在，跳过''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) user_associated_table_name
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_permission_rule'
    AND COLUMN_NAME = 'user_associated_table_name'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `sys_permission_rule`
     ADD COLUMN `user_associated_table_name` varchar(50)
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''''
     COMMENT ''用户资源关联表名称'' AFTER `is_user_associated`',
  'SELECT ''user_associated_table_name 已存在，跳过''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 回填：现有规则都没有用户关联表
UPDATE `sys_permission_rule`
SET `is_user_associated` = 0, `user_associated_table_name` = ''
WHERE `is_user_associated` IS NULL OR `user_associated_table_name` IS NULL;
