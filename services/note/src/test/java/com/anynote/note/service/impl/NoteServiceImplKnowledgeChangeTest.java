package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteText;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.NoteCollabStateMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTextMapper;
import com.anynote.note.model.bo.NoteCreateParam;
import com.anynote.note.model.bo.NoteDeleteParam;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.NoteChangePublisher;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 笔记新建与删除时的知识变更单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplKnowledgeChangeTest {

    private static final long NOTE_ID = 42L;
    private static final long KNOWLEDGE_BASE_ID = 3L;

    @Mock private NoteMapper noteMapper;
    @Mock private NoteTextMapper noteTextMapper;
    @Mock private NoteCollabStateMapper noteCollabStateMapper;
    @Mock private TokenUtil tokenUtil;
    @Mock private RocketMQTemplate rocketMQTemplate;
    @Mock private RocketMQProperties rocketMQProperties;
    @Mock private NoteChangePublisher noteChangePublisher;
    @Mock private KnowledgeChangeService changeService;

    private NoteServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        if (TableInfoHelper.getTableInfo(Note.class) == null) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Note.class);
        }
    }

    @BeforeEach
    void setUp() {
        service = new NoteServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", noteMapper);
        ReflectionTestUtils.setField(service, "noteTextMapper", noteTextMapper);
        ReflectionTestUtils.setField(service, "noteCollabStateMapper", noteCollabStateMapper);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "rocketMQTemplate", rocketMQTemplate);
        ReflectionTestUtils.setField(service, "rocketMQProperties", rocketMQProperties);
        ReflectionTestUtils.setField(service, "noteChangePublisher", noteChangePublisher);
        ReflectionTestUtils.setField(service, "knowledgeChangeService", changeService);
        when(rocketMQProperties.getNoteTopic()).thenReturn("note-topic");
        SysUser sysUser = new SysUser();
        sysUser.setId(7L);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(7L);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    /**
     * 新建笔记后按新笔记 id 与所属知识库记录 NOTE CREATE。
     */
    @Test
    void createRecordsCreate() {
        when(noteTextMapper.insert(any(NoteText.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, NoteText.class).setId(9001L);
            return 1;
        });
        when(noteMapper.insert(any(Note.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, Note.class).setId(NOTE_ID);
            return 1;
        });
        NoteCreateParam param = new NoteCreateParam();
        param.setTitle("笔记");
        param.setKnowledgeBaseId(KNOWLEDGE_BASE_ID);

        service.createNote(param);

        verify(changeService).record(KnowledgeEntityType.NOTE, NOTE_ID, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.CREATE);
    }

    /**
     * 删除笔记使用删除前查询到的知识库记录 NOTE DELETE。
     */
    @Test
    void deleteRecordsPreviousKnowledgeBase() {
        when(noteMapper.selectOne(any(Wrapper.class))).thenReturn(
                Note.builder().noteTextId(9001L).knowledgeBaseId(KNOWLEDGE_BASE_ID).build());
        NoteDeleteParam param = new NoteDeleteParam();
        param.setId(NOTE_ID);

        service.deleteNote(param);

        verify(changeService).record(KnowledgeEntityType.NOTE, NOTE_ID, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.DELETE);
    }
}
