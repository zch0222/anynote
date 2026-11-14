CREATE TABLE IF NOT EXISTS `n_knowledge_change` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '变更游标',
  `entity_type` varchar(32) NOT NULL COMMENT '知识实体类型',
  `entity_id` bigint unsigned NOT NULL COMMENT '基础实体ID',
  `knowledge_base_id` bigint unsigned NOT NULL DEFAULT 0 COMMENT '所属知识库ID',
  `operation` varchar(16) NOT NULL COMMENT 'CREATE、UPDATE或DELETE',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_kb_id_id` (`knowledge_base_id`, `id`),
  KEY `idx_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识实体变更游标';
