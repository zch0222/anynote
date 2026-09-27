package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.user.UserParamException;
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
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Base64;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link NoteCollabServiceImpl} 的纯单测：协同快照的读取、原子比较写回与操作者归属。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteCollabServiceImplTest {

    private static final long NOTE_ID = 2571L;
    private static final long TEXT_ID = 9001L;
    private static final long CREATOR_ID = 3L;
    private static final long UPDATER_ID = 5L;
    private static final long OPERATOR_ID = 10086L;
    /** 笔记当前版本对应的更新时间（整秒） */
    private static final long BASE_TIME = 1790265600000L;
    private static final String BASE_VERSION = String.valueOf(BASE_TIME);
    private static final String EPOCH = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    private static final byte[] STATE = "y-doc-state".getBytes(StandardCharsets.UTF_8);

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private NoteCollabStateMapper noteCollabStateMapper;

    @Mock
    private RocketMQTemplate rocketMQTemplate;

    @Mock
    private RocketMQProperties rocketMQProperties;

    @Mock
    private ObjectProvider<StringRedisTemplate> redisProvider;

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    private NoteCollabServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new NoteCollabServiceImpl();
        when(redisProvider.getIfAvailable()).thenReturn(stringRedisTemplate);
        when(rocketMQProperties.getNoteTopic()).thenReturn("note-topic");
        ReflectionTestUtils.setField(service, "noteMapper", noteMapper);
        ReflectionTestUtils.setField(service, "noteCollabStateMapper", noteCollabStateMapper);
        ReflectionTestUtils.setField(service, "noteChangePublisher",
                new NoteChangePublisher(rocketMQTemplate, rocketMQProperties, redisProvider));
        fixClock(BASE_TIME + 60_000L);

        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(existingNote(UPDATER_ID));
        when(noteMapper.updateNoteIfVersion(anyLong(), any(), any(Date.class), any(), any(Date.class))).thenReturn(1);
        when(noteMapper.updateContent(any(NoteUpdateParam.class))).thenReturn(1);
    }

    private void fixClock(long millis) {
        ReflectionTestUtils.setField(service, "clock",
                Clock.fixed(Instant.ofEpochMilli(millis), ZoneId.of("Asia/Shanghai")));
    }

    private static Note existingNote(Long updateBy) {
        Note note = Note.builder()
                .id(NOTE_ID)
                .title("周会纪要")
                .noteTextId(TEXT_ID)
                .knowledgeBaseId(1L)
                .status(0)
                .dataScope(1)
                .permissions("70000")
                .deleted(0)
                .content("# 周会纪要\n\n旧正文")
                .build();
        note.setCreateBy(CREATOR_ID);
        note.setUpdateBy(updateBy);
        note.setUpdateTime(new Date(BASE_TIME));
        return note;
    }

    private static CollabSnapshotSaveDTO dto(String title, Long operatorId) {
        return new CollabSnapshotSaveDTO(title, "# 周会纪要\n\n新正文",
                Base64.getEncoder().encodeToString(STATE), EPOCH, BASE_VERSION, operatorId);
    }

    @Test
    @DisplayName("版本一致时原子写回标题、正文与协同状态，返回严格递增的新版本号")
    void savesWhenVersionMatches() {
        NoteSaveResultVO result = service.saveSnapshot(NOTE_ID, dto("周会纪要（改）", OPERATOR_ID));

        String expectedVersion = String.valueOf(BASE_TIME + 60_000L);
        assertEquals(expectedVersion, result.getVersion());
        assertEquals("周会纪要（改）", result.getTitle());
        assertEquals("# 周会纪要\n\n新正文", result.getContent());
        verify(noteMapper).updateNoteIfVersion(eq(NOTE_ID), eq("周会纪要（改）"),
                eq(new Date(BASE_TIME + 60_000L)), eq(OPERATOR_ID), eq(new Date(BASE_TIME)));

        ArgumentCaptor<NoteUpdateParam> content = ArgumentCaptor.forClass(NoteUpdateParam.class);
        verify(noteMapper).updateContent(content.capture());
        assertEquals(TEXT_ID, content.getValue().getContentId());
        assertEquals("# 周会纪要\n\n新正文", content.getValue().getContent());

        ArgumentCaptor<NoteCollabState> state = ArgumentCaptor.forClass(NoteCollabState.class);
        verify(noteCollabStateMapper).upsert(state.capture());
        assertArrayEquals(STATE, state.getValue().getState());
        assertEquals(expectedVersion, state.getValue().getMdVersion());
        assertEquals(EPOCH, state.getValue().getEpoch());
    }

    @Test
    @DisplayName("版本过期时抛 A0409，不写正文、不写状态、不发消息")
    void rejectsStaleVersion() {
        when(noteMapper.updateNoteIfVersion(anyLong(), any(), any(Date.class), any(), any(Date.class))).thenReturn(0);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.saveSnapshot(NOTE_ID, dto("周会纪要", OPERATOR_ID)));

        assertEquals(ResCode.RESOURCE_VERSION_CONFLICT, exception.getErrorCode());
        verify(noteMapper, never()).updateContent(any(NoteUpdateParam.class));
        verify(noteCollabStateMapper, never()).upsert(any(NoteCollabState.class));
        verify(rocketMQTemplate, never()).asyncSend(anyString(), any(Object.class), any());
    }

    @Test
    @DisplayName("标题为空时不改标题，结果沿用原标题")
    void keepsTitleWhenAbsent() {
        NoteSaveResultVO result = service.saveSnapshot(NOTE_ID, dto(null, OPERATOR_ID));

        assertEquals("周会纪要", result.getTitle());
        verify(noteMapper).updateNoteIfVersion(eq(NOTE_ID), isNull(), any(Date.class), eq(OPERATOR_ID), any(Date.class));
    }

    @Test
    @DisplayName("同一秒内连续写回时新版本号仍比基准版本晚 1 秒")
    void versionStrictlyIncreasesWithinSameSecond() {
        fixClock(BASE_TIME + 200L);

        NoteSaveResultVO result = service.saveSnapshot(NOTE_ID, dto("周会纪要", OPERATOR_ID));

        assertEquals(String.valueOf(BASE_TIME + 1000L), result.getVersion());
    }

    @Test
    @DisplayName("本机时钟落后于基准版本时仍以基准版本 + 1 秒为准")
    void versionIncreasesWhenClockLags() {
        fixClock(BASE_TIME - 5_000L);

        assertEquals(BASE_TIME + 1000L, service.nextVersionTime(BASE_TIME));
    }

    @Test
    @DisplayName("operatorId 为空时记到笔记的最后更新者")
    void fallsBackToUpdater() {
        service.saveSnapshot(NOTE_ID, dto("周会纪要", null));

        verify(noteMapper).updateNoteIfVersion(eq(NOTE_ID), any(), any(Date.class), eq(UPDATER_ID), any(Date.class));
        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATE_NOTE_EDIT_LOG"),
                contains("\"userId\":" + UPDATER_ID), any());
    }

    @Test
    @DisplayName("没有最后更新者时退回创建者，编辑日志的操作者不会是空")
    void fallsBackToCreator() {
        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(existingNote(null));

        service.saveSnapshot(NOTE_ID, dto("周会纪要", null));

        verify(noteMapper).updateNoteIfVersion(eq(NOTE_ID), any(), any(Date.class), eq(CREATOR_ID), any(Date.class));
    }

    @Test
    @DisplayName("写回成功后发出索引与编辑日志两条消息，操作者是房间里最近的编辑者；不发外部写入通知")
    void publishesIndexAndEditLog() {
        service.saveSnapshot(NOTE_ID, dto("周会纪要", OPERATOR_ID));

        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATOR_NOTE_INDEX"), eq(NOTE_ID), any());
        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATE_NOTE_EDIT_LOG"),
                contains("\"userId\":" + OPERATOR_ID), any());
        verify(stringRedisTemplate, never()).convertAndSend(anyString(), anyString());
    }

    @Test
    @DisplayName("笔记不存在时抛 A0404")
    void rejectsMissingNote() {
        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(null);

        UserParamException exception = assertThrows(UserParamException.class,
                () -> service.saveSnapshot(NOTE_ID, dto("周会纪要", OPERATOR_ID)));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
        verify(noteMapper, never()).updateNoteIfVersion(anyLong(), any(), any(Date.class), any(), any(Date.class));
    }

    @Test
    @DisplayName("协同状态不是合法 Base64 时按参数错误拒绝")
    void rejectsInvalidState() {
        CollabSnapshotSaveDTO dto = dto("周会纪要", OPERATOR_ID);
        dto.setState("不是 base64 !!!");

        UserParamException exception = assertThrows(UserParamException.class,
                () -> service.saveSnapshot(NOTE_ID, dto));

        assertEquals(ResCode.USER_REQUEST_PARAM_ERROR, exception.getErrorCode());
    }

    @Test
    @DisplayName("读取快照：带回 Base64 状态、状态版本与谱系")
    void readsSnapshotWithState() {
        when(noteCollabStateMapper.selectByNoteId(NOTE_ID)).thenReturn(NoteCollabState.builder()
                .noteId(NOTE_ID).state(STATE).mdVersion("1790265590000").epoch(EPOCH).build());

        CollabSnapshotVO snapshot = service.getSnapshot(NOTE_ID);

        assertEquals("周会纪要", snapshot.getTitle());
        assertEquals("# 周会纪要\n\n旧正文", snapshot.getContent());
        assertEquals(BASE_VERSION, snapshot.getVersion());
        assertEquals(Base64.getEncoder().encodeToString(STATE), snapshot.getState());
        assertEquals("1790265590000", snapshot.getStateVersion());
        assertEquals(EPOCH, snapshot.getEpoch());
    }

    @Test
    @DisplayName("读取快照：从未写回过时状态三项都为空")
    void readsSnapshotWithoutState() {
        CollabSnapshotVO snapshot = service.getSnapshot(NOTE_ID);

        assertNull(snapshot.getState());
        assertNull(snapshot.getStateVersion());
        assertNull(snapshot.getEpoch());
        assertTrue(snapshot.getVersion().endsWith("000"));
    }

    @Test
    @DisplayName("读取快照：笔记不存在时抛 A0404")
    void readsMissingSnapshot() {
        when(noteMapper.selectNoteById(any(NoteQueryParam.class))).thenReturn(null);

        UserParamException exception = assertThrows(UserParamException.class, () -> service.getSnapshot(NOTE_ID));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }
}
