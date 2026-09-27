package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.mapper.NoteCollabStateMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.model.bo.NoteQueryParam;
import com.anynote.note.model.bo.NoteUpdateParam;
import com.anynote.note.model.dto.CollabSnapshotSaveDTO;
import com.anynote.note.model.po.NoteCollabState;
import com.anynote.note.model.vo.CollabSnapshotVO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.anynote.note.service.NoteChangePublisher;
import com.anynote.note.service.NoteCollabService;
import com.anynote.note.utils.NoteVersionUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Base64;
import java.util.Date;

/**
 * 笔记协同快照服务实现。
 *
 * <p>写回用一条带 {@code update_time} 条件的 UPDATE 完成版本比较与写入，
 * 新版本号保证严格大于基准版本号，同一秒内的连续写回不会得到相同的版本号。</p>
 *
 * @author 称霸幼儿园
 */
@Service
public class NoteCollabServiceImpl implements NoteCollabService {

    @Autowired
    private NoteMapper noteMapper;

    @Autowired
    private NoteCollabStateMapper noteCollabStateMapper;

    @Autowired
    private NoteChangePublisher noteChangePublisher;

    private Clock clock = Clock.systemDefaultZone();

    @Override
    public CollabSnapshotVO getSnapshot(Long noteId) {
        Note note = requireNote(noteId);
        NoteCollabState state = noteCollabStateMapper.selectByNoteId(noteId);
        boolean hasState = state != null && state.getState() != null && state.getState().length > 0;
        return CollabSnapshotVO.builder()
                .noteId(noteId)
                .title(note.getTitle())
                .content(StringUtils.isNotNull(note.getContent()) ? note.getContent() : "")
                .version(NoteVersionUtil.toVersion(note.getUpdateTime()))
                .state(hasState ? Base64.getEncoder().encodeToString(state.getState()) : null)
                .stateVersion(hasState ? state.getMdVersion() : null)
                .epoch(hasState ? state.getEpoch() : null)
                .build();
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public NoteSaveResultVO saveSnapshot(Long noteId, CollabSnapshotSaveDTO dto) {
        Note oldNote = requireNote(noteId);
        long baseTime = parseVersion(dto.getBaseVersion());
        byte[] state = decodeState(dto.getState());
        String title = StringUtils.isNotEmpty(dto.getTitle()) && !dto.getTitle().isBlank() ? dto.getTitle() : null;
        Long operatorId = resolveOperator(dto.getOperatorId(), oldNote);
        Date updateTime = new Date(nextVersionTime(baseTime));

        Integer updated = noteMapper.updateNoteIfVersion(noteId, title, updateTime, operatorId, new Date(baseTime));
        if (updated == null || updated != 1) {
            throw new BusinessException("笔记已被其他写入方更新", ResCode.RESOURCE_VERSION_CONFLICT);
        }

        NoteUpdateParam contentParam = new NoteUpdateParam();
        contentParam.setContentId(oldNote.getNoteTextId());
        contentParam.setContent(dto.getContent());
        contentParam.setUpdateTime(updateTime);
        contentParam.setUpdateBy(operatorId);
        Integer contentCount = noteMapper.updateContent(contentParam);
        if (contentCount == null || contentCount != 1) {
            throw new BusinessException("更新笔记正文失败", ResCode.BUSINESS_ERROR);
        }

        String version = NoteVersionUtil.toVersion(updateTime);
        noteCollabStateMapper.upsert(NoteCollabState.builder()
                .noteId(noteId)
                .state(state)
                .mdVersion(version)
                .epoch(dto.getEpoch())
                .build());

        Note currentNote = Note.builder()
                .id(noteId)
                .title(title != null ? title : oldNote.getTitle())
                .noteTextId(oldNote.getNoteTextId())
                .knowledgeBaseId(oldNote.getKnowledgeBaseId())
                .status(oldNote.getStatus())
                .dataScope(oldNote.getDataScope())
                .permissions(oldNote.getPermissions())
                .deleted(oldNote.getDeleted())
                .content(dto.getContent())
                .knowledgeBaseName(oldNote.getKnowledgeBaseName())
                .submitTaskName(oldNote.getSubmitTaskName())
                .build();
        noteChangePublisher.publishSaved(noteId, oldNote, currentNote, operatorId);

        return NoteSaveResultVO.builder()
                .id(noteId)
                .title(currentNote.getTitle())
                .content(dto.getContent())
                .updateTime(updateTime)
                .version(version)
                .build();
    }

    /**
     * 新版本对应的更新时间：当前时间截断到秒，且至少比基准版本晚 1 秒，保证版本号严格递增。
     *
     * @param baseTime 基准版本对应的毫秒时间
     * @return 新的更新时间（毫秒，整秒）
     */
    long nextVersionTime(long baseTime) {
        return NoteVersionUtil.nextUpdateTime(new Date(baseTime), clock.millis());
    }

    /**
     * 本次写入记到谁名下：房间里最近一次编辑者；没有时沿用笔记的最后更新者，再退回创建者。
     */
    private Long resolveOperator(Long operatorId, Note oldNote) {
        if (operatorId != null) {
            return operatorId;
        }
        if (oldNote.getUpdateBy() != null && oldNote.getUpdateBy() != 0L) {
            return oldNote.getUpdateBy();
        }
        return oldNote.getCreateBy();
    }

    private Note requireNote(Long noteId) {
        Note note = noteMapper.selectNoteById(NoteQueryParam.builder().id(noteId).build());
        if (StringUtils.isNull(note)) {
            throw new UserParamException("笔记不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
        return note;
    }

    private static long parseVersion(String version) {
        try {
            return Long.parseLong(version);
        } catch (NumberFormatException e) {
            throw new UserParamException("基准版本号格式错误", ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private static byte[] decodeState(String state) {
        try {
            byte[] decoded = Base64.getDecoder().decode(state);
            if (decoded.length == 0) {
                throw new UserParamException("协同状态不能为空", ResCode.USER_REQUEST_PARAM_ERROR);
            }
            return decoded;
        } catch (IllegalArgumentException e) {
            throw new UserParamException("协同状态不是合法的 Base64", ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }
}
