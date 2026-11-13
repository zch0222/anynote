-- 2026-11-14 新增模型供应商目录表 a_model_provider（M16.1 P1 决策）
--
-- 用途：services/ai 从本表读取模型供应商目录（协议、地址、模型清单、数据出境开关、启停状态），
--       并通过内部端点把「解密后」的快照下发给 Python AI 服务；业务代码不再从 sys_config 等
--       散落配置里拼装模型供应商信息。
--
-- 凭据：`api_key_cipher` 存 AES-GCM 密文，格式为 Base64(iv || ciphertext || tag)，
--       iv 固定 12 字节、tag 128 位；主密钥只通过 services/ai 的环境变量
--       ANYNOTE_AI_CREDENTIAL_KEY（Base64 编码的 32 字节）注入，任何数据库、配置中心、
--       日志与接口返回中都不出现主密钥。接口返回的明文 apiKey 只供内部调用方在内存中使用。
--
-- 版本：`version` 每更新一次 +1；快照端点的版本号取本表所有行 version 的最大值，
--       与 Nacos 的非敏感映射版本拼接成 `<providersVersion>:<mappingVersion>` 供调用方做缓存比对。
--
-- 幂等：本脚本可重复执行（CREATE TABLE IF NOT EXISTS）。
-- 建表语句已同步到 infra/sql/anynote.sql。

CREATE TABLE IF NOT EXISTS `a_model_provider` (
  `id`                  bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `provider_key`        varchar(64)  NOT NULL COMMENT '供应商标识（唯一）',
  `display_name`        varchar(128) NOT NULL COMMENT '供应商展示名',
  `protocol`            varchar(32)  NOT NULL DEFAULT 'openai_compatible' COMMENT '协议类型，默认 openai_compatible',
  `base_url`            varchar(512) NOT NULL COMMENT '接口基地址',
  `api_key_cipher`      varchar(2048) NOT NULL COMMENT 'API Key 密文：Base64(iv || ciphertext || tag)，AES-GCM，iv 12 字节、tag 128 位',
  `models`              json         NOT NULL COMMENT '模型名数组（JSON array）',
  `data_egress_allowed` tinyint      NOT NULL DEFAULT 0 COMMENT '是否允许数据出境（0 否 1 是）',
  `enabled`             tinyint      NOT NULL DEFAULT 1 COMMENT '是否启用（0 停用 1 启用）',
  `version`             bigint       NOT NULL DEFAULT 1 COMMENT '版本号，每次更新 +1',
  `create_by`           bigint unsigned NOT NULL DEFAULT 0 COMMENT '创建者',
  `update_by`           bigint unsigned NOT NULL DEFAULT 0 COMMENT '更新者',
  `create_time`         datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`         datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_key` (`provider_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='模型供应商目录，凭据为 AES-GCM 密文，主密钥只在 services/ai 环境变量';
