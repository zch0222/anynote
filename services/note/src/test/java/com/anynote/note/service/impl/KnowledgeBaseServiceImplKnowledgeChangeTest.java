package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.po.NoteKnowledgeBase;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.api.model.po.UserKnowledgeBase;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.KnowledgeBaseMapper;
import com.anynote.note.mapper.UserKnowledgeBaseMapper;
import com.anynote.note.model.bo.KnowledgeBaseUpdateParam;
import com.anynote.note.model.dto.CreateKnowledgeBaeDTO;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.NoteTaskService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.Serializable;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 知识库新建、更新与删除时的知识变更单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeBaseServiceImplKnowledgeChangeTest {

    private static final long BASE_ID = 70L;
    private static final long USER_ID = 7L;

    @Mock private KnowledgeBaseMapper knowledgeBaseMapper;
    @Mock private UserKnowledgeBaseMapper userKnowledgeBaseMapper;
    @Mock private TokenUtil tokenUtil;
    @Mock private KnowledgeChangeService changeService;
    @Mock private NoteTaskService noteTaskService;

    private KnowledgeBaseServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new KnowledgeBaseServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", knowledgeBaseMapper);
        ReflectionTestUtils.setField(service, "userKnowledgeBaseMapper", userKnowledgeBaseMapper);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "knowledgeChangeService", changeService);
        ReflectionTestUtils.setField(service, "noteTaskService", noteTaskService);
        SysUser sysUser = new SysUser();
        sysUser.setId(USER_ID);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(USER_ID);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    /**
     * 新建知识库后以自身 id 作为实体与归属记录 KNOWLEDGE_BASE CREATE。
     */
    @Test
    void createRecordsCreate() {
        when(knowledgeBaseMapper.insert(any(NoteKnowledgeBase.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, NoteKnowledgeBase.class).setId(BASE_ID);
            return 1;
        });
        when(userKnowledgeBaseMapper.insert(any(UserKnowledgeBase.class))).thenReturn(1);
        CreateKnowledgeBaeDTO dto = new CreateKnowledgeBaeDTO();
        dto.setName("知识库");
        dto.setType(0);

        service.createKnowledgeBase(dto);

        verify(changeService).record(KnowledgeEntityType.KNOWLEDGE_BASE, BASE_ID, BASE_ID,
                KnowledgeOperation.CREATE);
    }

    /**
     * 更新知识库成功后记录 KNOWLEDGE_BASE UPDATE。
     */
    @Test
    void updateRecordsUpdate() {
        when(knowledgeBaseMapper.updateById(any(NoteKnowledgeBase.class))).thenReturn(1);

        service.updateKnowledgeBase(updateParam());

        verify(changeService).record(KnowledgeEntityType.KNOWLEDGE_BASE, BASE_ID, BASE_ID,
                KnowledgeOperation.UPDATE);
    }

    /**
     * 更新影响行数不为 1 时抛出既有错误且不记录变更。
     */
    @Test
    void failedUpdateRecordsNothing() {
        when(knowledgeBaseMapper.updateById(any(NoteKnowledgeBase.class))).thenReturn(0);

        assertThatThrownBy(() -> service.updateKnowledgeBase(updateParam()))
                .isInstanceOf(BusinessException.class);

        verify(changeService, never()).record(any(), anyLong(), anyLong(), any());
    }

    /**
     * 创建者删除知识库后记录 KNOWLEDGE_BASE DELETE。
     */
    @Test
    void deleteRecordsDelete() {
        NoteKnowledgeBase knowledgeBase = NoteKnowledgeBase.builder().id(BASE_ID).build();
        knowledgeBase.setCreateBy(USER_ID);
        when(knowledgeBaseMapper.selectById((Serializable) BASE_ID)).thenReturn(knowledgeBase);
        when(knowledgeBaseMapper.deleteById((Serializable) BASE_ID)).thenReturn(1);

        service.deleteKnowledgeBaseById(BASE_ID);

        verify(changeService).record(KnowledgeEntityType.KNOWLEDGE_BASE, BASE_ID, BASE_ID,
                KnowledgeOperation.DELETE);
    }

    /**
     * 新成员加入知识库后，为库内每个任务补成员并各记录一条 TASK UPDATE。
     */
    @Test
    void addUserRecordsTaskUpdatePerTask() {
        when(userKnowledgeBaseMapper.insert(any(UserKnowledgeBase.class))).thenReturn(1);
        when(noteTaskService.getNoteTasksByKnowledgeBaseId(BASE_ID)).thenReturn(List.of(
                NoteTask.builder().id(11L).knowledgeBaseId(BASE_ID).build(),
                NoteTask.builder().id(12L).knowledgeBaseId(BASE_ID).build()));

        service.addUserToKnowledgeBase(UserKnowledgeBase.builder().userId(9L).knowledgeBaseId(BASE_ID)
                .permissions(3).build());

        verify(changeService).record(KnowledgeEntityType.TASK, 11L, BASE_ID, KnowledgeOperation.UPDATE);
        verify(changeService).record(KnowledgeEntityType.TASK, 12L, BASE_ID, KnowledgeOperation.UPDATE);
    }

    private KnowledgeBaseUpdateParam updateParam() {
        KnowledgeBaseUpdateParam param = new KnowledgeBaseUpdateParam();
        param.setId(BASE_ID);
        param.setName("知识库");
        return param;
    }
}
