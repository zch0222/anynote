package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeOutlineDTO;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.vo.KnowledgeOutlineVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 知识库目录权限过滤与 Markdown 大纲顺序单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeOutlineServiceImplTest {

    @Mock private NoteMapper noteMapper;
    @Mock private DocMapper docMapper;
    @Mock private MoocMapper moocMapper;
    @Mock private MoocItemMapper itemMapper;
    @Mock private NoteTaskMapper taskMapper;
    @Mock private KnowledgeEntityService entityService;
    @Mock private KnowledgeAccessService accessService;

    private KnowledgeOutlineServiceImpl service;
    private LoginUser user;

    @BeforeAll
    static void initTableInfo() {
        for (Class<?> type : new Class<?>[]{Note.class, Doc.class, MoocItemPO.class, NoteTask.class}) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new KnowledgeOutlineServiceImpl(noteMapper, docMapper, moocMapper, itemMapper, taskMapper,
                entityService, accessService);
        user = new LoginUser();
        user.setUserId(7L);
    }

    /**
     * 知识库目录在分页前移除不可读节点。
     */
    @Test
    void filtersUnreadableNodesBeforeCount() {
        KnowledgeRef root = KnowledgeRef.of(
                KnowledgeEntityType.KNOWLEDGE_BASE, 1L);
        when(accessService.isReadable(user, root)).thenReturn(true);
        when(noteMapper.selectList(any())).thenReturn(List.of(Note.builder().id(2L).status(0).build()));
        when(docMapper.selectList(any())).thenReturn(List.of(Doc.builder().id(3L).build()));
        when(accessService.isReadable(any(), any())).thenAnswer(invocation -> {
            KnowledgeRef ref = invocation.getArgument(1);
            return ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE || ref.getId() == 2L;
        });
        when(entityService.get(any(), eq(false))).thenAnswer(invocation -> {
            KnowledgeRef ref = invocation.getArgument(0);
            return KnowledgeSourceDocumentVO.builder().ref(ref.ref()).entityType(ref.getType().getValue())
                    .entityId(ref.getId()).kbId(1L).title("节点" + ref.getId()).sourceUpdatedAt(new Date(1000L)).build();
        });
        KnowledgeOutlineDTO request = request("kb:1");
        request.setPageSize(1);

        KnowledgeOutlineVO result = service.outline(user, request);

        assertThat(result.getTotal()).isEqualTo(1L);
        assertThat(result.getNodes()).extracting(KnowledgeOutlineVO.Node::getRef).containsExactly("note:2");
        assertThat(result.isHasMore()).isFalse();
    }

    /**
     * Markdown 大纲保持原文顺序并返回行定位。
     */
    @Test
    void keepsMarkdownHeadingOrder() {
        when(accessService.isReadable(any(), any())).thenReturn(true);
        when(entityService.get(any(), eq(true)))
                .thenReturn(KnowledgeSourceDocumentVO.builder().ref("note:2").entityType("note")
                        .format("markdown").body("# 一\n正文\n## 二\n### 三\n# 四\n").build());

        KnowledgeOutlineVO result = service.outline(user, request("note:2"));

        assertThat(result.getNodes()).extracting(KnowledgeOutlineVO.Node::getTitle)
                .containsExactly("一", "二", "三", "四");
        assertThat(result.getNodes().get(0).getLocator()).containsEntry("startLine", 1)
                .containsEntry("endLine", 4);
        assertThat(result.getNodes().get(3).getLocator()).containsEntry("startLine", 5);
    }

    /**
     * 目录大小超过 100 时使用确认的错误文案。
     */
    @Test
    void rejectsOversizedPage() {
        KnowledgeOutlineDTO request = request("kb:1");
        request.setPageSize(101);
        assertThatThrownBy(() -> service.outline(user, request))
                .isInstanceOf(BusinessException.class).hasMessage("单次请求数量超出限制");
    }

    private KnowledgeOutlineDTO request(String ref) {
        KnowledgeOutlineDTO request = new KnowledgeOutlineDTO();
        request.setRef(ref);
        return request;
    }
}
