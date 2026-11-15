package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.po.NoteTaskSubmissionRecord;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.NoteTaskSubmissionRecordMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeQueryDTO;
import com.anynote.note.model.dto.KnowledgeStatsDTO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeQueryVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.model.vo.KnowledgeStatsVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.system.api.model.bo.LoginUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 全实体结构化查询、白名单与任务命名查询单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeQueryServiceImplTest {

    @Mock private KnowledgeEntityService entityService;
    @Mock private KnowledgeAccessService accessService;
    @Mock private UserNoteTaskMapper userTaskMapper;
    @Mock private NoteTaskSubmissionRecordMapper submissionMapper;

    private KnowledgeQueryServiceImpl service;
    private LoginUser user;

    @BeforeAll
    static void initTableInfo() {
        for (Class<?> type : new Class<?>[]{UserNoteTask.class, NoteTaskSubmissionRecord.class}) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new KnowledgeQueryServiceImpl(entityService, accessService, userTaskMapper, submissionMapper);
        user = new LoginUser();
        user.setUserId(7L);
        when(accessService.scope(any(), any())).thenReturn(KnowledgeScopeVO.builder()
                .userId(7L).defaultScope(false)
                .knowledgeBases(List.of(KnowledgeScopeVO.KnowledgeBase.builder().kbId(1L).build())).build());
        when(accessService.isReadable(any(), any())).thenReturn(true);
    }

    /**
     * 八种笔记所属实体都通过同一白名单查询入口返回结构化行，notice 与超限 indexStatus 被拒绝。
     */
    @ParameterizedTest
    @EnumSource(value = KnowledgeEntityType.class, mode = EnumSource.Mode.EXCLUDE, names = "NOTICE")
    void queriesEveryEntityType(KnowledgeEntityType type) {
        KnowledgeSourceDocumentVO document = document(type, 3L, "标题", new Date(1000L));
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), anyBoolean()))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(document)).hasMore(false).build());
        KnowledgeQueryDTO request = request(type.getValue());
        request.setWithCount(true);

        KnowledgeQueryVO result = service.query(user, request);

        assertThat(result.getRows()).hasSize(1);
        assertThat(result.getRows().get(0).getEntityType()).isEqualTo(type.getValue());
        assertThat(result.getCount()).isEqualTo(1L);
    }

    /**
     * 资料索引状态支持 0..4（含 UNEXTRACTABLE），且拒绝 notice 与越界状态。
     */
    @Test
    void acceptsUnextractableDocFilterAndRejectsNoticeQuery() {
        when(entityService.page(eq("doc"), anyLong(), anyLong(), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of()).hasMore(false).build());
        KnowledgeQueryDTO docQuery = request("doc");
        docQuery.setFilters(Map.of("indexStatus", 4));
        assertThat(service.query(user, docQuery).getRows()).isEmpty();

        KnowledgeQueryDTO invalidDocQuery = request("doc");
        invalidDocQuery.setFilters(Map.of("indexStatus", 5));
        assertThatThrownBy(() -> service.query(user, invalidDocQuery))
                .isInstanceOf(BusinessException.class).hasMessage("结构化查询参数不合法");

        assertThatThrownBy(() -> service.query(user, request("notice")))
                .isInstanceOf(BusinessException.class).hasMessage("结构化查询参数不合法");
    }

    /**
     * 计数在权限过滤之后，limit 不影响 count。
     */
    @Test
    void countsAfterPermissionFiltering() {
        List<KnowledgeSourceDocumentVO> documents = List.of(
                document(KnowledgeEntityType.NOTE, 1L, "旧", new Date(1000L)),
                document(KnowledgeEntityType.NOTE, 2L, "新", new Date(2000L)),
                document(KnowledgeEntityType.NOTE, 3L, "无权", new Date(3000L)));
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), anyBoolean()))
                .thenReturn(KnowledgeExportVO.builder().documents(documents).hasMore(false).build());
        when(accessService.isReadable(any(), any())).thenAnswer(invocation ->
                invocation.getArgument(1, KnowledgeRef.class).getId() != 3L);
        KnowledgeQueryDTO request = request("note");
        request.setLimit(1);
        request.setWithCount(true);

        KnowledgeQueryVO result = service.query(user, request);

        assertThat(result.getRows()).extracting(KnowledgeQueryVO.Row::getTitle).containsExactly("新");
        assertThat(result.getCount()).isEqualTo(2L);
    }

    /**
     * 未知过滤器和非法排序在读取实体前被拒绝。
     */
    @Test
    void rejectsUnknownFilterAndSort() {
        KnowledgeQueryDTO unknown = request("note");
        unknown.setFilters(Map.of("sql", "drop"));
        assertThatThrownBy(() -> service.query(user, unknown))
                .isInstanceOf(BusinessException.class).hasMessage("结构化查询参数不合法");
        verify(entityService, never()).page(anyString(), anyLong(), anyLong(), eq(200), anyBoolean());

        KnowledgeQueryDTO sort = request("note");
        sort.setSort("title:invalid");
        assertThatThrownBy(() -> service.query(user, sort))
                .isInstanceOf(BusinessException.class).hasMessage("结构化查询参数不合法");
    }

    /**
     * MY_TASKS 返回当前用户提交状态、笔记和历史版本。
     */
    @Test
    void myTasksIncludesSubmissionAttributes() {
        KnowledgeSourceDocumentVO task = document(KnowledgeEntityType.TASK, 4L, "任务", new Date(1000L));
        task.setAttributes(new LinkedHashMap<>(Map.of("endTime", new Date(5000L))));
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), anyBoolean()))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(task)).hasMore(false).build());
        when(userTaskMapper.selectOne(any())).thenReturn(UserNoteTask.builder().userId(7L).noteTaskId(4L)
                .permissions(2).status(0).build());
        when(submissionMapper.selectOne(any())).thenReturn(NoteTaskSubmissionRecord.builder()
                .noteTaskId(4L).userId(7L).noteId(8L).noteHistoryId(9L).submitTime(new Date(3000L)).build());
        KnowledgeQueryDTO request = request("task");
        request.setQueryName("MY_TASKS");
        request.setFilters(Map.of("submissionStatus", "NOT_SUBMITTED"));

        Map<String, Object> attributes = service.query(user, request).getRows().get(0).getAttributes();
        assertThat(attributes).containsEntry("submissionStatus", 0)
                .containsEntry("submissionNoteId", 8L).containsEntry("noteHistoryId", 9L);
    }

    /**
     * 默认笔记查询包含作者自己的未归档笔记。
     */
    @Test
    void defaultNoteQueryIncludesUnfiledScope() {
        when(accessService.scope(any(), any())).thenReturn(KnowledgeScopeVO.builder()
                .defaultScope(true).knowledgeBases(List.of()).build());
        when(entityService.page(eq("note"), eq(0L), eq(0L), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of()).hasMore(false).build());

        service.query(user, request("note"));

        verify(entityService).page("note", 0L, 0L, 200, false);
    }

    /**
     * 超管默认查询按普通成员身份复核内容权限。
     */
    @Test
    void adminDefaultQueryUsesOrdinaryMembership() {
        when(accessService.scope(any(), any())).thenReturn(KnowledgeScopeVO.builder()
                .admin(true).defaultScope(true).knowledgeBases(List.of()).build());
        KnowledgeSourceDocumentVO note = document(KnowledgeEntityType.NOTE, 1L, "他人私密", new Date(1000L));
        note.setKbId(0L);
        note.getAcl().setCreateBy(8L);
        when(entityService.page(eq("note"), eq(0L), eq(0L), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(note)).hasMore(false).build());
        when(accessService.isReadable(any(), any())).thenReturn(false);

        assertThat(service.query(user, request("note")).getRows()).isEmpty();
        verify(accessService).isReadable(argThat(login ->
                login.getSysUser() != null && "COMMON".equals(login.getSysUser().getRole().getRoleKey())), any());
    }

    /**
     * 统计按范围内知识库逐个计数四类直属内容，只计可读条目并取最晚更新时间。
     */
    @Test
    void statsCountsReadableDirectContentPerKnowledgeBase() {
        when(accessService.scope(any(), any())).thenReturn(KnowledgeScopeVO.builder()
                .userId(7L).defaultScope(true)
                .knowledgeBases(List.of(KnowledgeScopeVO.KnowledgeBase.builder().kbId(1L).name("库")
                        .role("EDIT").build())).build());
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of()).hasMore(false).build());
        when(entityService.page(eq("note"), eq(1L), eq(0L), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(
                        document(KnowledgeEntityType.NOTE, 1L, "可读", new Date(1000L)),
                        document(KnowledgeEntityType.NOTE, 2L, "无权", new Date(9000L)))).hasMore(false).build());
        when(entityService.page(eq("task"), eq(1L), eq(0L), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(
                        document(KnowledgeEntityType.TASK, 3L, "任务", new Date(3000L)))).hasMore(false).build());
        when(accessService.isReadable(any(), any())).thenAnswer(invocation ->
                invocation.getArgument(1, KnowledgeRef.class).getId() != 2L);

        KnowledgeStatsVO result = service.stats(user, new KnowledgeStatsDTO());

        assertThat(result.getKnowledgeBases()).hasSize(1);
        KnowledgeStatsVO.KnowledgeBaseStats knowledgeBase = result.getKnowledgeBases().get(0);
        assertThat(knowledgeBase.getName()).isEqualTo("库");
        assertThat(knowledgeBase.getRole()).isEqualTo("EDIT");
        assertThat(knowledgeBase.getCounts()).containsExactly(Map.entry("note", 1L), Map.entry("doc", 0L),
                Map.entry("mooc", 0L), Map.entry("task", 1L));
        assertThat(knowledgeBase.getLatestUpdateTime()).isEqualTo(new Date(3000L));
        verify(entityService, never()).page(eq("note"), eq(0L), anyLong(), eq(200), anyBoolean());
    }

    /**
     * 统计无可读条目时最近更新时间为空，显式范围原样传给检索范围。
     */
    @Test
    void statsPassesExplicitScopeAndLeavesEmptyTimeNull() {
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of()).hasMore(false).build());
        KnowledgeStatsDTO request = new KnowledgeStatsDTO();
        request.setKnowledgeBaseIds(List.of(1L));

        KnowledgeStatsVO result = service.stats(user, request);

        assertThat(result.getKnowledgeBases().get(0).getLatestUpdateTime()).isNull();
        verify(accessService).scope(eq(user), argThat(scope -> List.of(1L).equals(scope.getKnowledgeBaseIds())));
    }

    /**
     * 超管默认范围的统计按普通成员身份判定可读性。
     */
    @Test
    void statsAdminDefaultScopeUsesOrdinaryMembership() {
        when(accessService.scope(any(), any())).thenReturn(KnowledgeScopeVO.builder()
                .admin(true).defaultScope(true)
                .knowledgeBases(List.of(KnowledgeScopeVO.KnowledgeBase.builder().kbId(1L).build())).build());
        when(entityService.page(anyString(), anyLong(), anyLong(), eq(200), eq(false)))
                .thenReturn(KnowledgeExportVO.builder().documents(List.of(
                        document(KnowledgeEntityType.NOTE, 1L, "笔记", new Date(1000L)))).hasMore(false).build());

        service.stats(user, null);

        verify(accessService, atLeastOnce()).isReadable(argThat(login ->
                login.getSysUser() != null && "COMMON".equals(login.getSysUser().getRole().getRoleKey())), any());
    }

    private KnowledgeQueryDTO request(String entity) {
        KnowledgeQueryDTO request = new KnowledgeQueryDTO();
        request.setEntity(entity);
        return request;
    }

    private KnowledgeSourceDocumentVO document(KnowledgeEntityType type, Long id, String title, Date updatedAt) {
        return KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(type, id).ref())
                .entityType(type.getValue()).subtype(type.isMoocItemSubtype() ? type.getValue() : null)
                .entityId(id).kbId(1L).title(title).sourceCreatedAt(new Date(500L)).sourceUpdatedAt(updatedAt)
                .acl(KnowledgeSourceDocumentVO.Acl.builder().createBy(7L).build())
                .attributes(new LinkedHashMap<>()).build();
    }
}
