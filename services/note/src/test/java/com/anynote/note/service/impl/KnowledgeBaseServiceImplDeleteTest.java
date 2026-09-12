package com.anynote.note.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.po.NoteKnowledgeBase;
import com.anynote.note.mapper.KnowledgeBaseMapper;
import com.anynote.system.api.model.bo.LoginUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.Serializable;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link KnowledgeBaseServiceImpl#deleteKnowledgeBaseById} 的纯单测。
 *
 * <p>原实现把创建者判断写反了（是创建者才抛「没有权限删除知识库」），结果是
 * 创建者永远删不掉自己的知识库，而任何非创建者都能删别人的。本测试先复现该缺陷，
 * 再约束修复后的语义：只有创建者能删。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeBaseServiceImplDeleteTest {

    private static final long BASE_ID = 70L;
    private static final long OWNER_ID = 325L;
    private static final long OTHER_USER_ID = 326L;

    @Mock
    private KnowledgeBaseMapper knowledgeBaseMapper;

    @Mock
    private TokenUtil tokenUtil;

    private KnowledgeBaseServiceImpl knowledgeBaseService;

    @BeforeEach
    void setUp() {
        knowledgeBaseService = new KnowledgeBaseServiceImpl();
        ReflectionTestUtils.setField(knowledgeBaseService, "baseMapper", knowledgeBaseMapper);
        ReflectionTestUtils.setField(knowledgeBaseService, "tokenUtil", tokenUtil);
        when(knowledgeBaseMapper.selectById((Serializable) BASE_ID)).thenReturn(knowledgeBase(OWNER_ID));
        when(knowledgeBaseMapper.deleteById((Serializable) BASE_ID)).thenReturn(1);
        loginAs(OWNER_ID);
    }

    private NoteKnowledgeBase knowledgeBase(long createBy) {
        NoteKnowledgeBase base = new NoteKnowledgeBase();
        base.setId(BASE_ID);
        base.setName("CLI 知识库");
        base.setCreateBy(createBy);
        return base;
    }

    private void loginAs(long userId) {
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    @Test
    @DisplayName("创建者可以删除自己的知识库")
    void ownerCanDelete() {
        assertDoesNotThrow(() -> knowledgeBaseService.deleteKnowledgeBaseById(BASE_ID));
        verify(knowledgeBaseMapper).deleteById((Serializable) BASE_ID);
    }

    @Test
    @DisplayName("非创建者删除时报没有权限，且不落库")
    void nonOwnerCannotDelete() {
        loginAs(OTHER_USER_ID);
        BusinessException exception =
                assertThrows(BusinessException.class, () -> knowledgeBaseService.deleteKnowledgeBaseById(BASE_ID));
        assertEquals("没有权限删除知识库", exception.getMessage());
        verify(knowledgeBaseMapper, never()).deleteById((Serializable) BASE_ID);
    }

    @Test
    @DisplayName("知识库不存在时报知识库不存在")
    void missingKnowledgeBase() {
        when(knowledgeBaseMapper.selectById((Serializable) BASE_ID)).thenReturn(null);
        BusinessException exception =
                assertThrows(BusinessException.class, () -> knowledgeBaseService.deleteKnowledgeBaseById(BASE_ID));
        assertEquals("知识库不存在", exception.getMessage());
        verify(knowledgeBaseMapper, never()).deleteById((Serializable) BASE_ID);
    }

    @Test
    @DisplayName("影响行数不为 1 时报删除失败")
    void deleteAffectedRowsMismatch() {
        when(knowledgeBaseMapper.deleteById((Serializable) BASE_ID)).thenReturn(0);
        BusinessException exception =
                assertThrows(BusinessException.class, () -> knowledgeBaseService.deleteKnowledgeBaseById(BASE_ID));
        assertEquals("删除知识库失败", exception.getMessage());
    }
}
