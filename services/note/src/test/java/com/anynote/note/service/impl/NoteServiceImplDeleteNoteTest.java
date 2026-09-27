package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.mapper.NoteCollabStateMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTextMapper;
import com.anynote.note.model.bo.NoteDeleteParam;
import com.anynote.note.service.NoteChangePublisher;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.Serializable;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link NoteServiceImpl#deleteNote} 单元测试：删除笔记时一并删除协同状态并通知在线房间。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplDeleteNoteTest {

    private static final long NOTE_ID = 42L;

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private NoteTextMapper noteTextMapper;

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

    private NoteServiceImpl noteService;

    @BeforeEach
    void setUp() {
        // deleteNote 里的 LambdaQueryWrapper.select(...) 需要实体的元数据缓存
        if (TableInfoHelper.getTableInfo(Note.class) == null) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Note.class);
        }
        noteService = new NoteServiceImpl();
        when(rocketMQProperties.getNoteTopic()).thenReturn("note-topic");
        when(redisProvider.getIfAvailable()).thenReturn(stringRedisTemplate);
        ReflectionTestUtils.setField(noteService, "baseMapper", noteMapper);
        ReflectionTestUtils.setField(noteService, "noteTextMapper", noteTextMapper);
        ReflectionTestUtils.setField(noteService, "noteCollabStateMapper", noteCollabStateMapper);
        ReflectionTestUtils.setField(noteService, "rocketMQTemplate", rocketMQTemplate);
        ReflectionTestUtils.setField(noteService, "rocketMQProperties", rocketMQProperties);
        ReflectionTestUtils.setField(noteService, "noteChangePublisher",
                new NoteChangePublisher(rocketMQTemplate, rocketMQProperties, redisProvider));
        when(noteMapper.selectOne(any(Wrapper.class))).thenReturn(Note.builder().noteTextId(9001L).build());
    }

    @Test
    @DisplayName("删除笔记时删除协同状态，并通知在线的协同房间")
    void deletesCollabStateAndNotifiesRoom() {
        NoteDeleteParam param = new NoteDeleteParam();
        param.setId(NOTE_ID);

        noteService.deleteNote(param);

        verify(noteMapper).deleteById((Serializable) NOTE_ID);
        verify(noteCollabStateMapper).deleteByNoteId(NOTE_ID);
        verify(stringRedisTemplate).convertAndSend(eq("collab:note-updated:" + NOTE_ID), anyString());
    }
}
