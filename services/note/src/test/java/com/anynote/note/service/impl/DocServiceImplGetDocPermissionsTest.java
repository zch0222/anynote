package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.auth.TokenException;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.enums.DocPermissions;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 资料现有权限入口委托统一权限服务的单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DocServiceImplGetDocPermissionsTest {

    @Mock private DocMapper docMapper;
    @Mock private TokenUtil tokenUtil;
    @Mock private KnowledgeBaseService knowledgeBaseService;

    private DocServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        if (TableInfoHelper.getTableInfo(Doc.class) == null) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Doc.class);
        }
    }

    @BeforeEach
    void setUp() {
        service = new DocServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", docMapper);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "knowledgeBaseService", knowledgeBaseService);
        ReflectionTestUtils.setField(service, "knowledgeAccessService",
                new KnowledgeAccessServiceImpl(null, null, null));
        when(docMapper.selectOne(any())).thenReturn(Doc.builder().id(1L).fileId(2L).knowledgeBaseId(3L)
                .permissions("40070").dataScope(3).build());
    }

    /**
     * 登录作者在作者位与其他用户位之间取最大值。
     */
    @Test
    void delegatesAuthorMaximumRule() {
        Doc doc = docMapper.selectOne(any());
        doc.setCreateBy(7L);
        when(tokenUtil.getLoginUser()).thenReturn(user(7L, false));

        assertThat(service.getDocPermissions(1L)).isEqualTo(DocPermissions.MANAGE);
    }

    /**
     * 匿名资料读取只使用第五位权限。
     */
    @Test
    void delegatesAnonymousRule() {
        when(tokenUtil.getLoginUser()).thenThrow(new TokenException());

        assertThat(service.getDocPermissions(1L)).isEqualTo(DocPermissions.NO);
    }

    /**
     * 超管资料权限保持 MANAGE。
     */
    @Test
    void delegatesAdminRule() {
        when(tokenUtil.getLoginUser()).thenReturn(user(9L, true));

        assertThat(service.getDocPermissions(1L)).isEqualTo(DocPermissions.MANAGE);
    }

    private LoginUser user(Long id, boolean admin) {
        SysRole role = new SysRole();
        role.setRoleKey(admin ? "ADMIN_X" : "COMMON");
        SysUser sysUser = new SysUser();
        sysUser.setId(id);
        sysUser.setRole(role);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(id);
        loginUser.setSysUser(sysUser);
        return loginUser;
    }
}
