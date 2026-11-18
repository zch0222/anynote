-- 2026-11-18 模型配置去 Nacos 化（M17 / C3 拍板）
--
-- 用途：逻辑模型的推理输出格式与回传方式改由数据库配置，配合
--       a_logical_model 成为逻辑模型映射的唯一来源（不再读 Nacos anynote.ai.models.logical）。
--
-- 幂等：ADD COLUMN 无 IF NOT EXISTS 语法，重复执行前先确认列不存在。

ALTER TABLE `a_logical_model`
  ADD COLUMN `reasoning_format` varchar(32) NOT NULL DEFAULT 'none'
    COMMENT '推理输出格式：none / reasoning_content / reasoning / think_tag' AFTER `dimensions`,
  ADD COLUMN `reasoning_passthrough` varchar(32) NOT NULL DEFAULT 'none'
    COMMENT '同轮后续请求的推理回传方式：none 不回传 / empty 空字段 / original 原样回传' AFTER `reasoning_format`;
