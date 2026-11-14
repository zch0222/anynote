package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteHistory;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.api.model.po.NoteTaskSubmissionRecord;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.enums.UserNoteTaskStatus;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.mapper.NoteTaskSubmissionRecordMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.NoteTaskCreateParam;
import com.anynote.note.model.bo.SubmissionReturnParam;
import com.anynote.note.model.bo.NoteTaskSubmitParam;
import com.anynote.note.model.bo.NoteTaskUpdateParam;
import com.anynote.note.model.dto.NoteTaskSubmissionRecordCreateDTO;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.NoteHistoryService;
import com.anynote.note.service.NoteOperationLogService;
import com.anynote.note.service.NoteService;
import com.anynote.note.service.NoteTaskSubmissionRecordService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
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
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务新建、更新、提交与退回时的知识变更单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteTaskServiceImplKnowledgeChangeTest {

    @Mock private NoteTaskMapper taskMapper;
    @Mock private UserNoteTaskMapper userTaskMapper;
    @Mock private NoteTaskSubmissionRecordService submissionService;
    @Mock private NoteTaskSubmissionRecordMapper submissionMapper;
    @Mock private NoteService noteService;
    @Mock private NoteMapper noteMapper;
    @Mock private TokenUtil tokenUtil;
    @Mock private NoteHistoryService historyService;
    @Mock private NoteOperationLogService operationLogService;
    @Mock private KnowledgeChangeService changeService;
    @Mock private RocketMQTemplate rocketMQTemplate;
    @Mock private RocketMQProperties rocketMQProperties;
    @Mock private ThreadPoolTaskExecutor asyncExecutor;

    private NoteTaskServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        Class<?>[] types = {NoteTask.class, UserNoteTask.class, Note.class, NoteTaskSubmissionRecord.class};
        for (Class<?> type : types) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new NoteTaskServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", taskMapper);
        ReflectionTestUtils.setField(service, "userNoteTaskMapper", userTaskMapper);
        ReflectionTestUtils.setField(service, "noteTaskSubmissionRecordService", submissionService);
        ReflectionTestUtils.setField(service, "noteService", noteService);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "noteHistoryService", historyService);
        ReflectionTestUtils.setField(service, "noteOperationLogService", operationLogService);
        ReflectionTestUtils.setField(service, "knowledgeChangeService", changeService);
        ReflectionTestUtils.setField(service, "rocketMQTemplate", rocketMQTemplate);
        ReflectionTestUtils.setField(service, "rocketMQProperties", rocketMQProperties);
        ReflectionTestUtils.setField(service, "asyncExecutor", asyncExecutor);
        when(submissionService.getBaseMapper()).thenReturn(submissionMapper);
        when(noteService.getBaseMapper()).thenReturn(noteMapper);
        when(rocketMQProperties.getNoteTaskTopic()).thenReturn("task-topic");
        SysUser sysUser = new SysUser();
        sysUser.setId(7L);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(7L);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    /**
     * 新建任务后按新任务 id 与所属知识库记录 TASK CREATE。
     */
    @Test
    void createRecordsTaskCreate() {
        when(taskMapper.insert(any(NoteTask.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, NoteTask.class).setId(4L);
            return 1;
        });
        NoteTaskCreateParam param = new NoteTaskCreateParam();
        param.setId(1L);
        param.setTaskName("任务");

        service.createNoteTask(param);

        verify(changeService).record(KnowledgeEntityType.TASK, 4L, 1L, KnowledgeOperation.CREATE);
    }

    /**
     * 更新任务后按任务当前知识库记录 TASK UPDATE。
     */
    @Test
    void updateRecordsTaskUpdate() {
        when(taskMapper.updateById(any(NoteTask.class))).thenReturn(1);
        when(taskMapper.selectById(4L)).thenReturn(NoteTask.builder().id(4L).knowledgeBaseId(1L).build());

        service.updateNoteTask(NoteTaskUpdateParam.NoteTaskUpdateParamBuilder()
                .noteTaskId(4L).taskName("任务").build());

        verify(changeService).record(KnowledgeEntityType.TASK, 4L, 1L, KnowledgeOperation.UPDATE);
    }

    /**
     * 提交任务后同时更新笔记权限游标和任务状态游标。
     */
    @Test
    void submitRecordsNoteAndTask() {
        when(userTaskMapper.selectOne(any())).thenReturn(UserNoteTask.builder().userId(7L).noteTaskId(4L)
                .permissions(2).status(UserNoteTaskStatus.NOT_SUBMITTED.getValue()).build());
        when(taskMapper.selectOne(any())).thenReturn(NoteTask.builder().id(4L).knowledgeBaseId(1L)
                .startTime(new Date(0L)).endTime(new Date(Long.MAX_VALUE)).status(0).build());
        when(noteMapper.selectOne(any())).thenReturn(Note.builder().id(8L).knowledgeBaseId(1L).build());
        when(submissionMapper.selectCount(any())).thenReturn(0L);
        when(historyService.getLatestNoteHistory(8L)).thenReturn(NoteHistory.builder().id(9L).build());
        when(operationLogService.selectNoteEditCount(8L)).thenReturn(1L);
        when(noteService.submitNote(8L)).thenReturn(1);
        NoteTaskSubmissionRecordCreateDTO dto = new NoteTaskSubmissionRecordCreateDTO(4L, 8L);

        service.submitNoteTask(new NoteTaskSubmitParam(dto));

        verify(changeService).record(KnowledgeEntityType.NOTE, 8L, 1L, KnowledgeOperation.UPDATE);
        verify(changeService).record(KnowledgeEntityType.TASK, 4L, 1L, KnowledgeOperation.UPDATE);
    }

    /**
     * 退回提交后同时记录权限收紧和任务状态变化。
     */
    @Test
    void returnRecordsNoteAndTask() {
        NoteTaskSubmissionRecord record = NoteTaskSubmissionRecord.builder().id(5L).noteTaskId(4L)
                .userId(7L).noteId(8L).status(0).build();
        when(submissionMapper.updateById(any(NoteTaskSubmissionRecord.class))).thenReturn(1);
        when(userTaskMapper.selectOne(any())).thenReturn(UserNoteTask.builder().userId(7L).noteTaskId(4L)
                .permissions(2).status(1).build());
        when(noteMapper.selectOne(any())).thenReturn(Note.builder().id(8L).permissions("44000").build());
        when(noteMapper.updateById(any(Note.class))).thenReturn(1);
        when(taskMapper.selectById(4L)).thenReturn(NoteTask.builder().id(4L).knowledgeBaseId(1L).build());

        service.returnSubmission(new SubmissionReturnParam(record, 4L));

        verify(changeService).record(KnowledgeEntityType.NOTE, 8L, 1L, KnowledgeOperation.UPDATE);
        verify(changeService).record(KnowledgeEntityType.TASK, 4L, 1L, KnowledgeOperation.UPDATE);
    }
}
