-- 2026-11-15 新增知识检索运行参数表 a_retrieval_setting（M16.5）
--
-- 用途：services/ai 保存运行期可修改的检索参数（单行，id 固定为 1），
--       合并进 GET /internal/v1/model-providers/snapshot 的 retrieval 字段；
--       Python 每次运行开始时读取一次，运行中的循环沿用开始时的值。
--       无记录时按代码默认值下发，因此本脚本不插入数据。
--
-- 幂等：本脚本可重复执行（CREATE TABLE IF NOT EXISTS）。
-- 建表语句已同步到 infra/sql/anynote.sql。

CREATE TABLE IF NOT EXISTS `a_retrieval_setting` (
  `id` bigint unsigned NOT NULL COMMENT '主键，固定为 1',
  `rrf_k` int NOT NULL DEFAULT 60 COMMENT '倒数排名融合常数',
  `channel_candidates` int NOT NULL DEFAULT 50 COMMENT '每个召回通道的候选数',
  `keyword_lexical_weight` decimal(5,2) NOT NULL DEFAULT 1.50 COMMENT '关键词型查询的全文权重',
  `keyword_semantic_weight` decimal(5,2) NOT NULL DEFAULT 0.50 COMMENT '关键词型查询的语义权重',
  `question_lexical_weight` decimal(5,2) NOT NULL DEFAULT 1.00 COMMENT '完整问句的全文权重',
  `question_semantic_weight` decimal(5,2) NOT NULL DEFAULT 1.20 COMMENT '完整问句的语义权重',
  `default_lexical_weight` decimal(5,2) NOT NULL DEFAULT 1.00 COMMENT '其余查询的全文权重',
  `default_semantic_weight` decimal(5,2) NOT NULL DEFAULT 1.00 COMMENT '其余查询的语义权重',
  `item_weight` decimal(5,2) NOT NULL DEFAULT 0.80 COMMENT '条目级通道权重',
  `authority_original` decimal(5,2) NOT NULL DEFAULT 1.00 COMMENT '原始内容的权威性系数',
  `authority_transcript` decimal(5,2) NOT NULL DEFAULT 0.90 COMMENT '转写内容的权威性系数',
  `authority_generated` decimal(5,2) NOT NULL DEFAULT 0.70 COMMENT '模型生成内容的权威性系数',
  `max_chunks_per_entity` int NOT NULL DEFAULT 3 COMMENT '每个实体最多保留的片段数',
  `search_default_limit` int NOT NULL DEFAULT 10 COMMENT 'kb_search 默认返回条数',
  `search_max_limit` int NOT NULL DEFAULT 20 COMMENT 'kb_search 最多返回条数',
  `neighbor_window` int NOT NULL DEFAULT 1 COMMENT '相邻片段扩展的前后片数',
  `neighbor_max_chars` int NOT NULL DEFAULT 6000 COMMENT '相邻扩展后的总字数上限',
  `read_max_chars` int NOT NULL DEFAULT 2000 COMMENT 'kb_read 单次返回字数',
  `grep_max_hits` int NOT NULL DEFAULT 50 COMMENT 'kb_grep 最多命中数',
  `grep_context_default` int NOT NULL DEFAULT 2 COMMENT 'kb_grep 默认上下文行数',
  `grep_context_max` int NOT NULL DEFAULT 5 COMMENT 'kb_grep 最大上下文行数',
  `grep_kb_candidates` int NOT NULL DEFAULT 20 COMMENT '库范围 kb_grep 的候选实体数',
  `short_keyword_chars` int NOT NULL DEFAULT 4 COMMENT '判定关键词型查询的短词长度',
  `rerank_enabled` tinyint NOT NULL DEFAULT 0 COMMENT '是否启用重排（0 关闭 1 开启）',
  `version` bigint NOT NULL DEFAULT 1 COMMENT '版本号，每次更新 +1',
  `create_by` bigint unsigned NOT NULL DEFAULT 0 COMMENT '创建者',
  `update_by` bigint unsigned NOT NULL DEFAULT 0 COMMENT '更新者',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='知识检索运行参数（单行表）';
