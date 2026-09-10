package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.model.bo.NoteQueryParam;
import com.anynote.note.model.bo.NoteUpdateParam;
import com.anynote.note.model.dto.NoteEditDTO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link NoteServiceImpl#editNote} 的纯单测：覆盖乐观并发版本检测与跨知识库移动的鉴权。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplEditNoteTest {

    private static final long NOTE_ID = 42L;
    private static final long USER_ID = 7L;
    private static final long BASE_ID = 100L;
    private static final long OTHER_BASE_ID = 200L;
    /** 笔记当前的更新时间，对应版本号 "1757520000000" */
    private static final Date CURRENT_UPDATE_TIME = new Date(1757520000000L);
    private static final String CURRENT_VERSION = "1757520000000";

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private TokenUtil tokenUtil;

    @Mock
    private KnowledgeBaseService knowledgeBaseService;

    @Mock
    private RocketMQTemplate rocketMQTemplate;

    @Mock
    private RocketMQProperties rocketMQProperties;

    private NoteServiceImpl noteService;

    @BeforeEach
    void setUp() {
        noteService = new NoteServiceImpl();
        ReflectionTestUtils.setField(noteService, "baseMapper", noteMapper);
        ReflectionTestUtils.setField(noteService, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(noteService, "knowledgeBaseService", knowledgeBaseService);
        ReflectionTestUtils.setField(noteService, "rocketMQTemplate", rocketMQTemplate);
        ReflectionTestUtils.setField(noteService, "rocketMQProperties", rocketMQProperties);

        SysUser sysUser = new SysUser();
        sysUser.setId(USER_ID);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(USER_ID);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
        when(rocketMQProperties.getNoteTopic()).thenReturn("note-topic");

        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(existingNote());
        when(noteMapper.updateNote(any(NoteUpdateParam.class))).thenReturn(1);
        when(noteMapper.updateContent(any(NoteUpdateParam.class))).thenReturn(1);
    }

    private Note existingNote() {
        Note note = Note.builder()
                .id(NOTE_ID)
                .title("旧标题")
                .noteTextId(9001L)
                .knowledgeBaseId(BASE_ID)
                .status(0)
                .dataScope(1)
                .permissions("70000")
                .deleted(0)
                .content("旧正文")
                .build();
        note.setUpdateTime(CURRENT_UPDATE_TIME);
        return note;
    }

    private NoteUpdateParam param(NoteEditDTO dto) {
        dto.setNoteId(NOTE_ID);
        return new NoteUpdateParam(dto);
    }

    @Test
    @DisplayName("版本号与服务端一致时保存成功，并回传服务端权威状态与新版本号")
    void savesAndReturnsAuthoritativeStateWhenVersionMatches() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setTitle("新标题");
        dto.setContent("新正文");
        dto.setVersion(CURRENT_VERSION);

        NoteSaveResultVO result = noteService.editNote(param(dto));

        assertEquals(NOTE_ID, result.getId());
        assertEquals("新标题", result.getTitle());
        assertEquals("新正文", result.getContent());
        // 新版本号必须来自本次写入的更新时间，且与旧版本不同，否则前端会一直用过期版本发下一次保存
        assertEquals(String.valueOf(result.getUpdateTime().getTime()), result.getVersion());
        assertNotEquals(CURRENT_VERSION, result.getVersion());
        verify(noteMapper).updateNote(any(NoteUpdateParam.class));
        verify(noteMapper).updateContent(any(NoteUpdateParam.class));
    }

    @Test
    @DisplayName("写入的更新时间截断到整秒，避免毫秒尾数让下一次保存被误判冲突")
    void truncatesUpdateTimeToWholeSecond() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setContent("新正文");

        NoteSaveResultVO result = noteService.editNote(param(dto));

        assertEquals(0L, result.getUpdateTime().getTime() % 1000L);
    }

    @Test
    @DisplayName("版本号过期时抛 A0409，且不产生任何写入与消息")
    void rejectsStaleVersionWithoutAnyWrite() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setContent("并发写入的正文");
        dto.setVersion("1757519000000");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> noteService.editNote(param(dto)));

        assertEquals(ResCode.RESOURCE_VERSION_CONFLICT, exception.getErrorCode());
        verify(noteMapper, never()).updateNote(any(NoteUpdateParam.class));
        verify(noteMapper, never()).updateContent(any(NoteUpdateParam.class));
        verify(rocketMQTemplate, never()).asyncSend(anyString(), any(Object.class), any());
    }

    @Test
    @DisplayName("不带版本号时沿用旧行为，直接覆盖保存")
    void savesWithoutVersionForBackwardCompatibility() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setContent("legacy 前端的正文");

        NoteSaveResultVO result = noteService.editNote(param(dto));

        assertEquals("旧标题", result.getTitle());
        assertEquals("legacy 前端的正文", result.getContent());
        verify(noteMapper).updateNote(any(NoteUpdateParam.class));
    }

    @Test
    @DisplayName("只改标题时正文沿用服务端已有内容")
    void keepsExistingContentWhenOnlyTitleChanges() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setTitle("只改标题");

        NoteSaveResultVO result = noteService.editNote(param(dto));

        assertEquals("只改标题", result.getTitle());
        assertEquals("旧正文", result.getContent());
    }

    @Test
    @DisplayName("笔记不存在时抛资源未找到")
    void rejectsMissingNote() {
        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(null);
        NoteEditDTO dto = new NoteEditDTO();
        dto.setContent("正文");

        UserParamException exception = assertThrows(UserParamException.class,
                () -> noteService.editNote(param(dto)));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
        verify(noteMapper, never()).updateNote(any(NoteUpdateParam.class));
    }

    @Test
    @DisplayName("移动到有编辑权限的知识库时下发新的 knowledgeBaseId")
    void movesNoteWhenTargetBaseIsEditable() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(USER_ID, OTHER_BASE_ID)).thenReturn(2);
        NoteEditDTO dto = new NoteEditDTO();
        dto.setKnowledgeBaseId(OTHER_BASE_ID);

        NoteUpdateParam updateParam = param(dto);
        noteService.editNote(updateParam);

        assertEquals(OTHER_BASE_ID, updateParam.getKnowledgeBaseId());
        verify(noteMapper).updateNote(updateParam);
    }

    @Test
    @DisplayName("对目标知识库没有编辑权限时拒绝移动，且不写库")
    void rejectsMoveWhenTargetBaseIsNotEditable() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(USER_ID, OTHER_BASE_ID)).thenReturn(3);
        NoteEditDTO dto = new NoteEditDTO();
        dto.setKnowledgeBaseId(OTHER_BASE_ID);

        assertThrows(AuthException.class, () -> noteService.editNote(param(dto)));

        verify(noteMapper, never()).updateNote(any(NoteUpdateParam.class));
    }

    @Test
    @DisplayName("与目标知识库无任何关联时拒绝移动")
    void rejectsMoveWhenTargetBasePermissionIsUnknown() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(USER_ID, OTHER_BASE_ID)).thenReturn(null);
        NoteEditDTO dto = new NoteEditDTO();
        dto.setKnowledgeBaseId(OTHER_BASE_ID);

        assertThrows(AuthException.class, () -> noteService.editNote(param(dto)));

        verify(noteMapper, never()).updateNote(any(NoteUpdateParam.class));
    }

    @Test
    @DisplayName("知识库id与当前归属相同时不触发目标库鉴权，也不下发该列")
    void doesNotAuthorizeWhenBaseIsUnchanged() {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setKnowledgeBaseId(BASE_ID);
        dto.setContent("正文");

        NoteUpdateParam updateParam = param(dto);
        noteService.editNote(updateParam);

        verify(knowledgeBaseService, never()).getUserKnowledgeBasePermissions(anyLong(), anyLong());
        assertEquals(null, updateParam.getKnowledgeBaseId());
    }
}
