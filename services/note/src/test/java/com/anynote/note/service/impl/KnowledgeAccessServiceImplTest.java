package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.po.UserKnowledgeBase;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.UserKnowledgeBaseMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeAuthorizeDTO;
import com.anynote.note.model.dto.KnowledgeScopeDTO;
import com.anynote.note.model.vo.KnowledgeAuthorizationVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeEntityService;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 知识范围、批量授权和继承权限单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeAccessServiceImplTest {

    @Mock
    private KnowledgeEntityService entityService;
    @Mock
    private UserKnowledgeBaseMapper membershipMapper;
    @Mock
    private UserNoteTaskMapper userTaskMapper;

    private KnowledgeAccessServiceImpl service;
    private LoginUser user;
    private LoginUser admin;

    @BeforeAll
    static void initTableInfo() {
        for (Class<?> type : new Class<?>[]{UserKnowledgeBase.class, UserNoteTask.class}) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new KnowledgeAccessServiceImpl(entityService, membershipMapper, userTaskMapper);
        user = user(7L, false);
        admin = user(99L, true);
        lenient().when(membershipMapper.selectList(any())).thenReturn(List.of(
                UserKnowledgeBase.builder().userId(7L).knowledgeBaseId(1L).permissions(3).build(),
                UserKnowledgeBase.builder().userId(99L).knowledgeBaseId(1L).permissions(3).build()));
        mockKnowledgeBase(1L, "库一");
    }

    /**
     * 超管默认范围只包含自己加入的知识库。
     */
    @Test
    void adminDefaultScopeUsesOwnMemberships() {
        KnowledgeScopeVO scope = service.scope(admin, new KnowledgeScopeDTO());

        assertThat(scope.isAdmin()).isTrue();
        assertThat(scope.isDefaultScope()).isTrue();
        assertThat(scope.getKnowledgeBases()).hasSize(1);
        assertThat(scope.getKnowledgeBases().get(0).getRole()).isEqualTo("READ");
        assertThat(scope.getKnowledgeBases().get(0).isExplicit()).isFalse();
    }

    /**
     * 超管显式指定知识库时只补充该知识库并标记为显式范围。
     */
    @Test
    void adminExplicitScopeAddsOnlyRequestedKnowledgeBase() {
        mockKnowledgeBase(2L, "库二");
        KnowledgeScopeDTO request = new KnowledgeScopeDTO();
        request.setKnowledgeBaseIds(List.of(2L));

        KnowledgeScopeVO scope = service.scope(admin, request);

        assertThat(scope.getKnowledgeBases()).hasSize(1);
        assertThat(scope.getKnowledgeBases().get(0).getKbId()).isEqualTo(2L);
        assertThat(scope.getKnowledgeBases().get(0).getRole()).isEqualTo("ADMIN");
        assertThat(scope.getKnowledgeBases().get(0).isExplicit()).isTrue();
    }

    /**
     * 普通用户显式指定非成员知识库时不加入范围。
     */
    @Test
    void ordinaryExplicitScopeCannotAddNonMembership() {
        mockKnowledgeBase(2L, "库二");
        KnowledgeScopeDTO request = new KnowledgeScopeDTO();
        request.setKnowledgeBaseIds(List.of(2L));

        assertThat(service.scope(user, request).getKnowledgeBases()).isEmpty();
    }

    /**
     * 超管显式指定实体时按实体所属知识库扩展范围。
     */
    @Test
    void explicitEntityRefResolvesAdminKnowledgeBase() {
        KnowledgeSourceDocumentVO note = document(KnowledgeEntityType.NOTE, 9L, 9L, 1L, "70000", 1);
        KnowledgeSourceDocumentVO kb = document(KnowledgeEntityType.KNOWLEDGE_BASE, 9L, 9L, 1L, null, null);
        when(entityService.get(argThat(ref -> ref != null && ref.getType() == KnowledgeEntityType.NOTE && ref.getId() == 9L),
                eq(false))).thenReturn(note);
        when(entityService.get(argThat(ref -> ref != null && ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE
                && ref.getId() == 9L), eq(false))).thenReturn(kb);
        KnowledgeScopeDTO request = new KnowledgeScopeDTO();
        request.setRefs(List.of("note:9"));

        assertThat(service.scope(admin, request).getKnowledgeBases())
                .extracting(KnowledgeScopeVO.KnowledgeBase::getKbId).containsExactly(9L);
    }

    /**
     * 批量授权保持输入顺序与重复项，不可读项不返回版本与知识库。
     */
    @Test
    void authorizePreservesOrderDuplicatesAndHidesDeniedVersions() {
        KnowledgeAuthorizeDTO.Item first = item("note:1", null);
        KnowledgeAuthorizeDTO.Item denied = item("note:2", null);
        KnowledgeAuthorizeDTO request = new KnowledgeAuthorizeDTO();
        request.setItems(List.of(first, denied, item("note:1", null)));
        KnowledgeSourceDocumentVO readable = document(KnowledgeEntityType.NOTE, 1L, 1L, 7L, "70000", 1);
        KnowledgeSourceDocumentVO unreadable = document(KnowledgeEntityType.NOTE, 2L, 1L, 8L, "70000", 3);
        readable.setAttributes(java.util.Map.of("moocId", 11L));
        unreadable.setAttributes(java.util.Map.of("moocId", 12L));
        mockDocument(readable, "body", "content-1", "meta-1");
        mockDocument(unreadable, "secret", "content-2", "meta-2");

        KnowledgeAuthorizationVO result = service.authorize(user, request);

        assertThat(result.getItems()).hasSize(3);
        assertThat(result.getItems().get(0).isReadable()).isTrue();
        assertThat(result.getItems().get(0).getContentVersion()).isEqualTo("content-1");
        assertThat(result.getItems().get(0).getMoocId()).isEqualTo(11L);
        assertThat(result.getItems().get(2).isReadable()).isTrue();
        assertThat(result.getItems().get(1).isReadable()).isFalse();
        assertThat(result.getItems().get(1).getContentVersion()).isNull();
        assertThat(result.getItems().get(1).getMetaVersion()).isNull();
        assertThat(result.getItems().get(1).getKbId()).isNull();
        assertThat(result.getItems().get(1).getMoocId()).isNull();
    }

    /**
     * 复合键批量可读性：可读笔记、慕课字幕与知识库返回；他人私有笔记、已删除实体与格式错误的键判为不可读，整批不失败。
     */
    @Test
    void authorizeCombinedMarksBadKeysUnreadableWithoutFailingBatch() {
        mockKnowledgeBase(3L, "库三");
        mockDocument(document(KnowledgeEntityType.NOTE, 1L, 1L, 7L, "70000", 1), "body", "c1", "m1");
        mockDocument(document(KnowledgeEntityType.NOTE, 2L, 1L, 8L, "70000", 1), "secret", "c2", "m2");
        mockDocument(document(KnowledgeEntityType.TRANSCRIPT, 5L, 1L, 8L, "77400", 3), "字幕", "c3", "m3");
        when(membershipMapper.selectOne(any())).thenReturn(
                UserKnowledgeBase.builder().userId(7L).knowledgeBaseId(1L).permissions(2).build());

        List<String> readable = service.authorizeCombined(user, List.of(
                "note:1", "note:2", "mooc_item:5#transcript", "kb:3", "note:9", "note:abc", "unknown:1"));

        assertThat(readable).containsExactly("note:1", "mooc_item:5#transcript", "kb:3");
    }

    /**
     * 字幕继承所属慕课的权限与成员关系。
     */
    @Test
    void moocSubtypeInheritsParentAcl() {
        KnowledgeSourceDocumentVO transcript = document(KnowledgeEntityType.TRANSCRIPT, 4L, 1L, 8L,
                "77400", 3);
        when(entityService.get(argThat(ref -> ref != null && ref.getType() == KnowledgeEntityType.TRANSCRIPT),
                eq(false))).thenReturn(transcript);
        when(membershipMapper.selectOne(any())).thenReturn(
                UserKnowledgeBase.builder().userId(7L).knowledgeBaseId(1L).permissions(2).build());

        assertThat(service.isReadable(user, KnowledgeRef.of(KnowledgeEntityType.TRANSCRIPT, 4L))).isTrue();
    }

    /**
     * 未归档笔记只有作者和超管可读。
     */
    @Test
    void unfiledNoteIsAuthorOnlyExceptAdmin() {
        KnowledgeSourceDocumentVO note = document(KnowledgeEntityType.NOTE, 3L, 0L, 7L, "70000", 1);
        when(entityService.get(any(), eq(false))).thenReturn(note);
        KnowledgeRef ref = KnowledgeRef.of(KnowledgeEntityType.NOTE, 3L);

        assertThat(service.isReadable(user, ref)).isTrue();
        assertThat(service.isReadable(user(8L, false), ref)).isFalse();
        assertThat(service.isReadable(admin, ref)).isTrue();
    }

    /**
     * 格式错误的实体标识使用确认的错误文案。
     */
    @Test
    void malformedRefUsesConfirmedError() {
        assertThatThrownBy(() -> service.isReadable(user, KnowledgeRef.parse("note:abc", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("知识实体参数不合法");
    }

    private void mockKnowledgeBase(Long id, String name) {
        KnowledgeSourceDocumentVO document = document(KnowledgeEntityType.KNOWLEDGE_BASE, id, id, 1L, null, null);
        document.setTitle(name);
        lenient().when(entityService.get(argThat(ref -> ref != null && ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE
                && ref.getId().equals(id)), eq(false))).thenReturn(document);
    }

    private void mockDocument(KnowledgeSourceDocumentVO document, String body, String contentVersion,
                              String metaVersion) {
        KnowledgeSourceDocumentVO full = copy(document);
        full.setBody(body);
        full.setContentVersion(contentVersion);
        full.setMetaVersion(metaVersion);
        KnowledgeRef expected = KnowledgeRef.of(KnowledgeEntityType.parse(document.getEntityType()), document.getEntityId());
        lenient().when(entityService.get(argThat(ref -> ref != null && ref.getType() == expected.getType()
                && ref.getId().equals(expected.getId())), eq(false))).thenReturn(document);
        lenient().when(entityService.get(argThat(ref -> ref != null && ref.getType() == expected.getType()
                && ref.getId().equals(expected.getId())), eq(true))).thenReturn(full);
    }

    private KnowledgeSourceDocumentVO document(KnowledgeEntityType type, Long id, Long kbId, Long createBy,
                                               String permissions, Integer dataScope) {
        return KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(type, id).ref())
                .entityType(type.getValue())
                .subtype(type.isMoocItemSubtype() ? type.getValue() : null)
                .entityId(id)
                .kbId(kbId)
                .title("标题")
                .acl(KnowledgeSourceDocumentVO.Acl.builder()
                        .createBy(createBy).permissions(permissions).dataScope(dataScope).build())
                .build();
    }

    private KnowledgeSourceDocumentVO copy(KnowledgeSourceDocumentVO source) {
        return KnowledgeSourceDocumentVO.builder()
                .ref(source.getRef()).entityType(source.getEntityType()).subtype(source.getSubtype())
                .entityId(source.getEntityId()).kbId(source.getKbId()).title(source.getTitle())
                .acl(source.getAcl()).attributes(source.getAttributes()).metaVersion(source.getMetaVersion()).build();
    }

    private KnowledgeAuthorizeDTO.Item item(String ref, String subtype) {
        KnowledgeAuthorizeDTO.Item item = new KnowledgeAuthorizeDTO.Item();
        item.setRef(ref);
        item.setSubtype(subtype);
        return item;
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
