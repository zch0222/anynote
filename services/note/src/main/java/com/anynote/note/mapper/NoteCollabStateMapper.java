package com.anynote.note.mapper;

import com.anynote.note.model.po.NoteCollabState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 笔记协同状态 Mapper
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface NoteCollabStateMapper {

    /**
     * 按笔记id读取协同状态。
     *
     * @param noteId 笔记id
     * @return 协同状态，不存在时为 null
     */
    NoteCollabState selectByNoteId(@Param("noteId") Long noteId);

    /**
     * 写入或覆盖一篇笔记的协同状态。
     *
     * @param state 协同状态
     * @return 影响行数
     */
    int upsert(NoteCollabState state);

    /**
     * 删除一篇笔记的协同状态。
     *
     * @param noteId 笔记id
     * @return 影响行数
     */
    int deleteByNoteId(@Param("noteId") Long noteId);
}
