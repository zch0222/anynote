package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.model.bo.NoteTaskQueryParam;
import com.anynote.note.model.dto.MemberNoteTaskDTO;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * {@link NoteTaskServiceImpl#getMemberNoteTaskById} 的纯单测（方案 §4 B-4）。
 *
 * <p>成员侧原来只有列表端点，单个任务要靠翻页查找。新端点权限锚在任务所在知识库的 READ，
 * 且必须真正在任务成员名单里，否则返回无权限。</p>
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteTaskServiceImplMemberDetailTest {

    private static final long TASK_ID = 292L;
    private static final long BASE_ID = 70L;
    private static final long MEMBER_ID = 101L;

    @Mock
    private NoteTaskMapper noteTaskMapper;

    @Mock
    private KnowledgeBaseService knowledgeBaseService;

    @Mock
    private TokenUtil tokenUtil;

    private NoteTaskServiceImpl noteTaskService;

    @BeforeEach
    void setUp() {
        noteTaskService = new NoteTaskServiceImpl();
        ReflectionTestUtils.setField(noteTaskService, "baseMapper", noteTaskMapper);
        ReflectionTestUtils.setField(noteTaskService, "knowledgeBaseService", knowledgeBaseService);
        ReflectionTestUtils.setField(noteTaskService, "tokenUtil", tokenUtil);

        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(NoteTask.builder()
                .id(TASK_ID)
                .taskName("期末笔记任务")
                .knowledgeBaseId(BASE_ID)
                .status(0)
                .build());
        loginAs(MEMBER_ID);
    }

    private void loginAs(long userId) {
        SysUser sysUser = new SysUser();
        sysUser.setId(userId);
        sysUser.setUsername("member");
        // 非超管：getUserKnowledgeBasePermissions 的超管短路在真实实现里，这里只关心返回值
        sysUser.setRole(new SysRole());
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    private MemberNoteTaskDTO row(Integer submissionStatus) {
        MemberNoteTaskDTO dto = new MemberNoteTaskDTO();
        dto.setId(TASK_ID);
        dto.setTaskName("期末笔记任务");
        dto.setKnowledgeBaseId(BASE_ID);
        dto.setSubmissionStatus(submissionStatus);
        dto.setSubmissionNoteId(501L);
        dto.setTaskCreatorNickname("老师");
        return dto;
    }

    private NoteTaskQueryParam queryParam() {
        return NoteTaskQueryParam.NoteTaskQueryParamBuilder().noteTaskId(TASK_ID).build();
    }

    @Test
    @DisplayName("本人是任务成员：返回与列表行同结构的任务信息")
    void memberCanRead() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(MEMBER_ID, BASE_ID))
                .thenReturn(2); // EDIT，权限高于 READ，通过
        when(noteTaskMapper.selectMemberNoteTaskList(any())).thenReturn(
                Collections.singletonList(row(0)));

        MemberNoteTaskDTO result = noteTaskService.getMemberNoteTaskById(queryParam());

        assertEquals(TASK_ID, result.getId());
        assertEquals("期末笔记任务", result.getTaskName());
        assertEquals(0, result.getSubmissionStatus());
        assertEquals(501L, result.getSubmissionNoteId());
        assertEquals("老师", result.getTaskCreatorNickname());
    }

    @Test
    @DisplayName("本人是知识库管理员：submissionStatus = 2（无需提交）照常返回")
    void adminMemberCanRead() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(MEMBER_ID, BASE_ID))
                .thenReturn(1); // MANAGE
        when(noteTaskMapper.selectMemberNoteTaskList(any())).thenReturn(
                Collections.singletonList(row(2)));

        MemberNoteTaskDTO result = noteTaskService.getMemberNoteTaskById(queryParam());

        assertEquals(2, result.getSubmissionStatus());
    }

    @Test
    @DisplayName("不在知识库：返回无权限，且不查列表")
    void notInKnowledgeBase() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(MEMBER_ID, BASE_ID))
                .thenReturn(null);

        AuthException exception = assertThrows(AuthException.class,
                () -> noteTaskService.getMemberNoteTaskById(queryParam()));

        assertEquals(ResCode.UNAUTHORIZED_ERROR, exception.getErrorCode());
    }

    @Test
    @DisplayName("在知识库但不在任务成员里：无权限")
    void notTaskMember() {
        when(knowledgeBaseService.getUserKnowledgeBasePermissions(MEMBER_ID, BASE_ID))
                .thenReturn(3); // READ，满足知识库级要求
        // submission_status 为空即 n_user_note_task 没这条记录
        when(noteTaskMapper.selectMemberNoteTaskList(any())).thenReturn(
                Collections.singletonList(row(null)));

        AuthException exception = assertThrows(AuthException.class,
                () -> noteTaskService.getMemberNoteTaskById(queryParam()));

        assertEquals(ResCode.UNAUTHORIZED_ERROR, exception.getErrorCode());
    }

    @Test
    @DisplayName("任务不存在：抛 UserParamException（A0404）")
    void missingTask() {
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(null);

        UserParamException exception = assertThrows(UserParamException.class,
                () -> noteTaskService.getMemberNoteTaskById(queryParam()));

        assertEquals("任务不存在", exception.getMessage());
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }
}
