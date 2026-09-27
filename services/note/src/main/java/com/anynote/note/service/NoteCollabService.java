package com.anynote.note.service;

import com.anynote.note.model.dto.CollabSnapshotSaveDTO;
import com.anynote.note.model.vo.CollabSnapshotVO;
import com.anynote.note.model.vo.NoteSaveResultVO;

/**
 * 笔记协同快照服务：供协同服务开房读取、落库写回。
 *
 * @author 称霸幼儿园
 */
public interface NoteCollabService {

    /**
     * 读取笔记的协同快照：标题、正文、版本号，以及上次写回时存下的 Y.Doc 状态。
     *
     * @param noteId 笔记id
     * @return 协同快照
     */
    CollabSnapshotVO getSnapshot(Long noteId);

    /**
     * 按基准版本号原子写回标题、正文与 Y.Doc 状态。
     *
     * @param noteId 笔记id
     * @param dto    写回参数
     * @return 写回后的权威状态与新版本号
     */
    NoteSaveResultVO saveSnapshot(Long noteId, CollabSnapshotSaveDTO dto);
}
