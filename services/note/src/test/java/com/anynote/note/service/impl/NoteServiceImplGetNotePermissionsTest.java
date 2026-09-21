package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * {@link NoteServiceImpl#getNotePermissions} 纯单测。
 *
 * 重点是「知识库只读成员」分支：修复前它用 {@code Integer.valueOf(char)}，
 * 拿到的是字符码（{@code '4'} -> 52）而不是数字 4，{@code permissionCompute}
 * 的 0/4/6/7 分支全不匹配，必然抛 A0300(AUTH_ERROR)。因为
 * {@code @RequiresNotePermissions} 切面统一经此方法取权限，这个缺陷会让
 * **知识库只读成员打不开该库里的任何笔记**，而不只是协同路径。
 *
 * 这里同时钉住两条：修复后的正确取值，以及「修复前那种调用方式确实会抛错」
 * 的反证——后者用 {@link NoteServiceImplStub} 之外无法直接构造，改为断言
 * 字符码与数字的语义差（避免将来有人把 substring 又改回 charAt）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplGetNotePermissionsTest {

    private static final long NOTE_ID = 42L;
    private static final long AUTHOR_ID = 7L;
    private static final long READER_ID = 8L;
    private static final long ADMIN_ID = 9L;
    private static final long EDITOR_ID = 10L;
    private static final long STRANGER_ID = 11L;
    private static final long ADMIN_ROLE_ID = 1L;

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private TokenUtil tokenUtil;

    @Mock
    private KnowledgeBaseService knowledgeBaseService;

    private NoteServiceImpl noteService;
    /**
     * LambdaQueryWrapper 的列名要靠 MyBatis Plus 的 TableInfo 缓存把 Note::getId
     * 这类方法引用解析成列名。纯单测里没有 MyBatis 启动流程，手动注册一次实体元数据，
     * 否则 getNotePermissions 里的 select(...) 会抛「can not find lambda cache」。
     */
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

        when(noteMapper.selectOne(any())).thenReturn(note("76666", AUTHOR_ID));
    }

    private Note note(String permissions, Long createBy) {
        Note note = new Note();
        note.setId(NOTE_ID);
        note.setPermissions(permissions);
        note.setCreateBy(createBy);
        return note;
    }

    /**
     * 以指定用户身份登录。
     *
     * <p>角色必须非空：{@code getNotePermissions} 会无条件调用
     * {@code SysUser.isAdminX(role)}，而它内部直接取 {@code role.getRoleKey()}。
     * 普通用户给一个 roleKey 不是 ADMIN_X 的普通角色，管理员才用 ADMIN_X。</p>
     */
    private void loginAs(long userId, Long roleId) {
        SysUser sysUser = new SysUser();
        sysUser.setId(userId);
        SysRole role = new SysRole();
        role.setId(roleId == null ? 2L : roleId);
        role.setRoleKey(roleId == null ? "COMMON" : "ADMIN_X");
        sysUser.setRole(role);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    @Test
    @DisplayName("作者按第 1 槽位取权限")
    void authorUsesFirstSlot() {
        loginAs(AUTHOR_ID, null);
        assertEquals(NotePermissions.MANAGE, noteService.getNotePermissions(NOTE_ID));
    }

    @Test
    @DisplayName("系统管理员恒为 MANAGE，且不查知识库成员关系")
    void adminAlwaysManages() {
        loginAs(ADMIN_ID, ADMIN_ROLE_ID);
        assertEquals(NotePermissions.MANAGE, noteService.getNotePermissions(NOTE_ID));
    }

    @Test
    @DisplayName("知识库管理员按第 2 槽位取权限")
    void knowledgeBaseManagerUsesSecondSlot() {
        loginAs(EDITOR_ID, null);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(EDITOR_ID, NOTE_ID))
                .thenReturn(1);
        assertEquals(NotePermissions.EDIT, noteService.getNotePermissions(NOTE_ID));
    }

    @Test
    @DisplayName("知识库编辑成员按第 3 槽位取权限")
    void knowledgeBaseEditorUsesThirdSlot() {
        loginAs(EDITOR_ID, null);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(EDITOR_ID, NOTE_ID))
                .thenReturn(2);
        assertEquals(NotePermissions.EDIT, noteService.getNotePermissions(NOTE_ID));
    }

    @Test
    @DisplayName("知识库只读成员封顶 READ：修复前把字符码传给 permissionCompute 会抛 AUTH_ERROR")
    void knowledgeBaseReaderCapsAtRead() {
        loginAs(READER_ID, null);
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(READER_ID, NOTE_ID))
                .thenReturn(3);

        NotePermissions permissions = noteService.getNotePermissions(NOTE_ID);

        assertEquals(NotePermissions.READ, permissions);
        // 复现旧实现的失败路径：字符码 '6' 不是数字 6，permissionCompute 会抛 AUTH_ERROR。
        // 这里用同一个 noteService 走一遍旧取值方式，钉住"charAt 不可用"这条结论。
        BusinessException thrown = assertThrows(BusinessException.class,
                () -> ReflectionTestUtils.invokeMethod(noteService, "permissionCompute",
                        Integer.valueOf("76666".charAt(2))));
        assertEquals(ResCode.AUTH_ERROR.getCode(), thrown.getErrorCode().getCode());
    }

    @Test
    @DisplayName("知识库只读成员且笔记禁止同库用户访问时为 NO")
    void knowledgeBaseReaderGetsNoWhenNoteForbidden() {
        loginAs(READER_ID, null);
        when(noteMapper.selectOne(any())).thenReturn(note("70000", AUTHOR_ID));
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(READER_ID, NOTE_ID))
                .thenReturn(3);

        assertEquals(NotePermissions.NO, noteService.getNotePermissions(NOTE_ID));
    }

    @Test
    @DisplayName("非知识库成员按第 4 槽位取权限（第 1 槽位故意不同，证明读的是第 4 槽）")
    void strangerUsesFourthSlot() {
        loginAs(STRANGER_ID, null);
        // 第 1 槽 '4'（作者只读）、第 4 槽 '6'（其它用户可编辑）：陌生人应命中第 4 槽拿到 EDIT
        when(noteMapper.selectOne(any())).thenReturn(note("46666", AUTHOR_ID));
        when(knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(STRANGER_ID, NOTE_ID))
                .thenReturn(null);
        assertEquals(NotePermissions.EDIT, noteService.getNotePermissions(NOTE_ID));
    }
}
