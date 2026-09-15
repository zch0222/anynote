package com.anynote.note.service;

import com.anynote.core.web.model.bo.PageBean;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteHistory;
import com.anynote.note.model.bo.NoteHistoryListItemQueryParam;
import com.anynote.note.model.bo.NoteHistoryQueryParam;
import com.anynote.note.model.vo.NoteHistoryListItemVO;
import com.anynote.note.model.vo.NoteHistoryVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Date;

/**
 * @author 称霸幼儿园
 */
public interface NoteHistoryService extends IService<NoteHistory> {

    public Long saveNoteHistory(Note note, Long operationId, Date date, Long createBy);

    public NoteHistory getLatestNoteHistory(Long noteId);

    public PageBean<NoteHistoryListItemVO> getNoteHistoryListItemVOList(NoteHistoryListItemQueryParam queryParam);

    public NoteHistoryVO getNoteHistory(NoteHistoryQueryParam noteHistoryQueryParam);

    /**
     * 按操作日志id查询历史版本
     *
     * <p>先按 operationId 定位操作日志取 noteId，再查快照。操作日志不存在时抛
     * {@code UserParamException("历史版本不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND)}，
     * 而不是让调用方对 null 取 noteId 触发空指针（那是 500）。</p>
     *
     * @param operationId 操作日志id
     * @return 历史版本内容
     */
    public NoteHistoryVO getNoteHistoryByOperationId(Long operationId);
}
