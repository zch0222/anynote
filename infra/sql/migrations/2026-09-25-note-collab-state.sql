-- 2026-09-25 新增笔记协同状态表 n_note_collab_state（协同服务落库，方案 docs/collab-persistence §7.2）
--
-- 协同服务负责把协同房间的正文写回 n_note / n_note_text，同时把房间的 Yjs 全量状态存进本表：
-- 协同服务重启后从这里恢复同一「谱系」的状态，重连的客户端推回来的增量不会让正文翻倍。
--
--   state       Y.encodeStateAsUpdate 的全量二进制
--   md_version  该状态对应的笔记版本号（n_note.update_time 的毫秒值），与当前版本不同即表示期间有外部写入
--   epoch       状态谱系标识（UUID），从 Markdown 全新构建状态时生成
--
-- 本表不是真相源：真相源仍是 n_note_text.content；本表行丢失只会让下次开房从 Markdown 重建。
-- 删除笔记时同步删除对应行（NoteServiceImpl#deleteNote）。
--
-- 幂等：重复执行安全。建表语句已同步到 infra/sql/anynote.sql。

CREATE TABLE IF NOT EXISTS `n_note_collab_state` (
  `note_id`     bigint      NOT NULL COMMENT '笔记id（n_note.id）',
  `state`       longblob    NOT NULL COMMENT 'Y.encodeStateAsUpdate 全量状态',
  `md_version`  varchar(20) NOT NULL COMMENT '该状态对应的笔记版本号（NoteVersionUtil.toVersion）',
  `epoch`       char(36)    NOT NULL COMMENT '状态谱系标识，从 Markdown 全新构建时生成',
  `update_time` datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`note_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='笔记协同状态：仅用于会话连续性，真相源仍是 n_note_text';
