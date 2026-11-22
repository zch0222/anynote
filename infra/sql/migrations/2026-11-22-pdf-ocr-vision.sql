-- 2026-11-22 PDF OCR 索引与多模态按页读取
--
-- 用途：声明 agent_main 的页面图像输入能力，并在助手历史消息中保存
--       实际发送给 LLM 的图片元数据清单；不保存图片字节或 data URL。
--
-- 幂等：ADD COLUMN 无 IF NOT EXISTS 语法，重复执行前先确认列不存在。

ALTER TABLE `a_logical_model`
  ADD COLUMN `supports_vision` tinyint(1) NOT NULL DEFAULT 0
    COMMENT '是否声明支持 OpenAI 兼容图像输入' AFTER `reasoning_passthrough`;

ALTER TABLE `a_chat_message`
  ADD COLUMN `visual_dispatches` JSON DEFAULT NULL
    COMMENT '向 LLM 发送图片的元数据清单，不含图片字节' AFTER `process`;
