package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.model.vo.CollabGrantVO;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * {@link NoteServiceImpl#getCollabGrant} 的纯单测（方案 §5.2）。
 *
 * <p>覆盖权限推导的六条分支（作者 / 库管理 / 库编辑 / 库读 / 无关用户 / 笔记不存在），
 * 并钉住「无权限回 perm=NONE 而不是抛 401」与「version 取自 updateTime」两条契约。</p>
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplCollabGrantTest {

    private static final long NOTE_ID = 42L;
    private static final long AUTHOR_ID = 7L;
    private static final long MEMBER_ID = 8L;
    private static final long STRANGER_ID = 11L;
    private static final long ADMIN_ID = 9L;
    private static final Date UPDATE_TIME = new Date(1758297600000L);

    private static final int KB_MANAGE = 1;
    private static final int KB_EDIT = 2;
    private static final int KB_READ = 3;

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private TokenUtil tokenUtil;

    @Mock
    private KnowledgeBaseService knowledgeBaseService;

    private NoteServiceImpl noteService;

    @BeforeAll
    static void initTableInfo() {
        if (TableInfoHelper.getTableInfo(Note.class) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), Note.class);
        }
    }

    @BeforeEach
    void setUp() {
        noteService = new NoteServiceImpl();
        ReflectionTestUtils.setField(noteService, "baseMapper", noteMapper);
        ReflectionTestUtils.setField(noteService, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(noteService, "knowledgeBaseService", knowledgeBaseService);
        when(noteMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(grantRow("76666", AUTHOR_ID));
    }

    /** collab-grant 只 select title / updateTime，这里构造一行带这两列的 Note。 */
    private Note grantRow(String permissions, Long createBy) {
        Note note = new Note();
        note.setId(NOTE_ID);
        note.setTitle("会议纪要");
        note.setPermissions(permissions);
        note.setCreateBy(createBy);
        note.setUpdateTime(UPDATE_TIME);
        return note;
    }

    private void loginAs(long userId, boolean admin) {
        SysUser sysUser = new SysUser();
        sysUser.setId(userId);
        SysRole role = new SysRole();
        role.setId(admin ? 1L : 2L);
        role.setRoleKey(admin ? "ADMIN_X" : "COMMON");
        sysUser.setRole(role);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    @Test
    @DisplayName("作者拿到 MANAGE 与权威版本令牌")
    void authorGetsManage() {
        loginAs(AUTHOR_ID, false);
        CollabGrantVO grant = noteService.getCollabGrant(NOTE_ID);
        assertEquals(NOTE_ID, grant.getNoteId());
        assertEquals("MANAGE", grant.getPerm());
        assertEquals(String.valueOf(UPDATE_TIME.getTime()), grant.getVersion());
        assertEquals("会议纪要", grant.getTitle());
    }

    @Test
    @DisplayName("系统管理员恒为 MANAGE")
    void adminGetsManage() {
        loginAs(ADMIN_ID, true);
        assertEquals("MANAGE", noteService.getCollabGrant(NOTE_ID).getPerm());
    }

    @Test
    @DisplayName("知识库管理员按第 2 槽位取 EDIT")
    void knowledgeBaseManagerGetsEdit() {
        loginAs(MEMBER_ID, false);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(MEMBER_ID, NOTE_ID))
                .thenReturn(KB_MANAGE);
        assertEquals("EDIT", noteService.getCollabGrant(NOTE_ID).getPerm());
    }

    @Test
    @DisplayName("知识库编辑成员按第 3 槽位取 EDIT")
    void knowledgeBaseEditorGetsEdit() {
        loginAs(MEMBER_ID, false);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(MEMBER_ID, NOTE_ID))
                .thenReturn(KB_EDIT);
        assertEquals("EDIT", noteService.getCollabGrant(NOTE_ID).getPerm());
    }

    @Test
    @DisplayName("知识库只读成员封顶 READ（依赖 M13.1 的 charAt 修复）")
    void knowledgeBaseReaderGetsRead() {
        loginAs(MEMBER_ID, false);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(MEMBER_ID, NOTE_ID))
                .thenReturn(KB_READ);
        assertEquals("READ", noteService.getCollabGrant(NOTE_ID).getPerm());
    }

    @Test
    @DisplayName("无关用户按第 4 槽位取权限，无权限时回 NONE 而不是抛异常")
    void strangerGetsNoneWithoutThrowing() {
        loginAs(STRANGER_ID, false);
        // 第 4 槽位 '0'：其它用户无权限
        when(noteMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(grantRow("76600", AUTHOR_ID));
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(STRANGER_ID, NOTE_ID))
                .thenReturn(null);
        assertEquals("NONE", noteService.getCollabGrant(NOTE_ID).getPerm());
    }

    @Test
    @DisplayName("笔记不存在时抛 A0404")
    void missingNoteThrowsNotFound() {
        loginAs(AUTHOR_ID, false);
        when(noteMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        UserParamException exception = assertThrows(UserParamException.class,
                () -> noteService.getCollabGrant(NOTE_ID));
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }

    @Test
    @DisplayName("updateTime 为空时 version 为 null，不编造版本号")
    void nullUpdateTimeYieldsNullVersion() {
        loginAs(AUTHOR_ID, false);
        Note row = grantRow("76666", AUTHOR_ID);
        row.setUpdateTime(null);
        when(noteMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(row);
        assertNull(noteService.getCollabGrant(NOTE_ID).getVersion());
    }

    @Test
    @DisplayName("权限槽位为非法数字时沿用 A0300（与 getNotePermissions 同口径）")
    void invalidPermissionsYieldsAuthError() {
        loginAs(AUTHOR_ID, false);
        when(noteMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(grantRow("36666", AUTHOR_ID));
        BusinessException exception = assertThrows(BusinessException.class,
                () -> noteService.getCollabGrant(NOTE_ID));
        assertEquals(ResCode.AUTH_ERROR, exception.getErrorCode());
    }
}
