-- 2026-11-15 新增运行时逻辑模型绑定表 a_logical_model（M16.4 运行时 Embedding 配置）
--
-- 用途：services/ai 保存运行期可切换的逻辑模型配置（当前用于 embedding），
--       合并进 GET /internal/v1/model-providers/snapshot，与 Nacos 静态配置互补；
--       凭据、baseUrl、dataEgressAllowed 仍统一来源于 a_model_provider。
--
-- 幂等：本脚本可重复执行（CREATE TABLE IF NOT EXISTS）。
-- 建表语句已同步到 infra/sql/anynote.sql。

CREATE TABLE IF NOT EXISTS `a_logical_model` (
  `id`           bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `logical_name` varchar(64)     NOT NULL COMMENT '逻辑用途标识（如 embedding）',
  `provider_key` varchar(64)     NULL DEFAULT NULL COMMENT '关联 a_model_provider.provider_key',
  `model_name`   varchar(128)    NULL DEFAULT NULL COMMENT '供应商侧模型名',
  `dimensions`   int             NULL DEFAULT NULL COMMENT '期望向量维度（1..2048），为空时自动探测',
  `enabled`      tinyint         NOT NULL DEFAULT 0 COMMENT '是否启用（0 停用 1 启用）',
  `version`      bigint          NOT NULL DEFAULT 1 COMMENT '版本号，每次更新 +1',
  `create_by`    bigint unsigned NOT NULL DEFAULT 0 COMMENT '创建者',
  `update_by`    bigint unsigned NOT NULL DEFAULT 0 COMMENT '更新者',
  `create_time`  datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_logical_name` (`logical_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='运行时逻辑模型绑定配置（如 embedding）';
