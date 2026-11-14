package com.anynote.note.service.impl;

import com.anynote.ai.api.RemoteMoocVideoSummarizeService;
import com.anynote.ai.api.model.po.MoocVideoSummarizePO;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.model.po.FilePO;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteKnowledgeBase;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.api.model.po.NoteText;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.KnowledgeBaseMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocItemTextMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.mapper.MoocVideoItemInfoMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.mapper.NoteTextMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocItemTextPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.po.MoocVideoItemInfoPO;
import com.anynote.note.model.vo.KnowledgeDocumentBatchVO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
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
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 八类知识实体的读取、版本和导出分页单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeEntityServiceImplTest {

    @Mock private KnowledgeBaseMapper knowledgeBaseMapper;
    @Mock private NoteMapper noteMapper;
    @Mock private NoteTextMapper noteTextMapper;
    @Mock private DocMapper docMapper;
    @Mock private MoocMapper moocMapper;
    @Mock private MoocItemMapper itemMapper;
    @Mock private MoocItemTextMapper itemTextMapper;
    @Mock private MoocVideoItemInfoMapper videoInfoMapper;
    @Mock private NoteTaskMapper taskMapper;
    @Mock private RemoteFileService fileService;
    @Mock private RemoteMoocVideoSummarizeService summarizeService;

    private KnowledgeEntityServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        Class<?>[] types = {NoteKnowledgeBase.class, Note.class, Doc.class, MoocPO.class, MoocItemPO.class,
                MoocItemTextPO.class, MoocVideoItemInfoPO.class, NoteTask.class};
        for (Class<?> type : types) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new KnowledgeEntityServiceImpl(knowledgeBaseMapper, noteMapper, noteTextMapper, docMapper,
                moocMapper, itemMapper, itemTextMapper, videoInfoMapper, taskMapper, fileService, summarizeService);
    }

    /**
     * 笔记返回 Markdown 正文、内容摘要和权限元数据摘要。
     */
    @Test
    void readsNoteWithSeparateVersions() {
        Note note = Note.builder().id(1L).noteTextId(2L).title("标题").knowledgeBaseId(3L)
                .status(0).permissions("70000").dataScope(1).build();
        note.setCreateBy(7L);
        note.setUpdateTime(new Date(1000L));
        when(noteMapper.selectById(1L)).thenReturn(note);
        NoteText text = new NoteText();
        text.setId(2L);
        text.setContent("hello");
        text.setUpdateTime(new Date(2000L));
        when(noteTextMapper.selectById(2L)).thenReturn(text);

        KnowledgeSourceDocumentVO document = service.get(KnowledgeRef.of(KnowledgeEntityType.NOTE, 1L), true);
        assertThat(document.getBody()).isEqualTo("hello");
        assertThat(document.getContentVersion()).isEqualTo(KnowledgeEntityServiceImpl.sha256("hello"));
        assertThat(document.getSourceUpdatedAt()).isEqualTo(new Date(2000L));

        String metaVersion = document.getMetaVersion();
        note.setPermissions("74000");
        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.NOTE, 1L), true).getMetaVersion())
                .isNotEqualTo(metaVersion);
        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.NOTE, 1L), true).getContentVersion())
                .isEqualTo(document.getContentVersion());
    }

    /**
     * 资料返回文件下载信息，不伪造 PDF 正文。
     */
    @Test
    void readsDocFileMetadata() {
        when(docMapper.selectById(1L)).thenReturn(Doc.builder().id(1L).fileId(2L).name("资料")
                .knowledgeBaseId(3L).permissions("77400").dataScope(3).indexStatus(3).build());
        when(fileService.getFileById(anyLong(), anyString())).thenReturn(ResData.success(FilePO.builder()
                .objectName("docs/a.pdf").hash("file-hash").url("http://file/a.pdf").build()));

        KnowledgeSourceDocumentVO document = service.get(KnowledgeRef.of(KnowledgeEntityType.DOC, 1L), true);
        assertThat(document.getBody()).isNull();
        assertThat(document.getContentUrl()).isEqualTo("http://file/a.pdf");
        assertThat(document.getContentVersion()).isEqualTo("file-hash");
        assertThat(document.getAttributes()).containsEntry("indexStatus", 3);
    }

    /**
     * 文档条目读取正文并继承慕课 ACL。
     */
    @Test
    void readsMoocItemWithInheritedAcl() {
        MoocItemPO item = MoocItemPO.builder().id(4L).moocId(2L).parentId(0L).moocItemType(2)
                .title("条目").build();
        when(itemMapper.selectById(4L)).thenReturn(item);
        when(moocMapper.selectById(2L)).thenReturn(MoocPO.builder().id(2L).knowledgeBaseId(3L)
                .permissions("77400").dataScope(3).build());
        when(itemTextMapper.selectList(any())).thenReturn(List.of(MoocItemTextPO.builder().moocItemId(4L)
                .itemText("# 正文").build()));

        KnowledgeSourceDocumentVO document = service.get(KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, 4L), true);
        assertThat(document.getBody()).isEqualTo("# 正文");
        assertThat(document.getAcl().getPermissions()).isEqualTo("77400");
        assertThat(document.getParentRef()).isEqualTo("mooc:2");
        assertThat(document.getFormat()).isEqualTo("markdown");
    }

    /**
     * 同一项存在多条历史正文时读取最新一条。
     */
    @Test
    void readsLatestMoocItemTextWhenDuplicatesExist() {
        MoocItemPO item = MoocItemPO.builder().id(4L).moocId(2L).parentId(0L).moocItemType(2).build();
        when(itemMapper.selectById(4L)).thenReturn(item);
        when(moocMapper.selectById(2L)).thenReturn(MoocPO.builder().id(2L).knowledgeBaseId(3L)
                .permissions("77400").dataScope(3).build());
        when(itemTextMapper.selectList(any())).thenReturn(List.of(
                MoocItemTextPO.builder().moocItemId(4L).itemText("最新正文").build(),
                MoocItemTextPO.builder().moocItemId(4L).itemText("旧正文").build()));

        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, 4L), true).getBody())
                .isEqualTo("最新正文");
    }

    /**
     * 字幕经 file 服务读取并标记为转写内容。
     */
    @Test
    void readsTranscriptThroughFileService() {
        videoItem(4L, 2L);
        when(videoInfoMapper.selectOne(any())).thenReturn(MoocVideoItemInfoPO.builder()
                .moocItemId(4L).srtObjectName("srt/a.srt").build());
        when(fileService.readTextFile(anyString(), anyString())).thenReturn(ResData.success("字幕"));

        KnowledgeSourceDocumentVO document = service.get(KnowledgeRef.of(KnowledgeEntityType.TRANSCRIPT, 4L), true);
        assertThat(document.getBody()).isEqualTo("字幕");
        assertThat(document.getAuthority()).isEqualTo("transcript");
        assertThat(document.getSubtype()).isEqualTo("transcript");
    }

    /**
     * 多条视频总结只返回最新一条并标记为模型生成。
     */
    @Test
    void readsOnlyLatestSummary() {
        videoItem(4L, 2L);
        MoocVideoSummarizePO old = MoocVideoSummarizePO.builder().id(1L).content("旧").build();
        old.setCreateTime(new Date(1000L));
        MoocVideoSummarizePO latest = MoocVideoSummarizePO.builder().id(2L).content("新").build();
        latest.setCreateTime(new Date(2000L));
        when(summarizeService.getMoocVideoSummarizesByMoocItemId(anyString(), any()))
                .thenReturn(ResData.success(List.of(old, latest)));

        KnowledgeSourceDocumentVO document = service.get(KnowledgeRef.of(KnowledgeEntityType.SUMMARY, 4L), true);
        assertThat(document.getBody()).isEqualTo("新");
        assertThat(document.getAttributes()).containsEntry("summaryId", 2L);
        assertThat(document.getAuthority()).isEqualTo("generated");
    }

    /**
     * 知识库、慕课和任务分别读取描述正文。
     */
    @Test
    void readsPlainTextEntities() {
        when(knowledgeBaseMapper.selectById(1L)).thenReturn(NoteKnowledgeBase.builder().id(1L)
                .name("库").detail("库描述").status(0).build());
        when(moocMapper.selectById(2L)).thenReturn(MoocPO.builder().id(2L).title("课")
                .moocDescription("课描述").knowledgeBaseId(1L).permissions("77400").dataScope(3).build());
        when(taskMapper.selectById(3L)).thenReturn(NoteTask.builder().id(3L).taskName("任务")
                .taskDescribe("任务描述").knowledgeBaseId(1L).build());

        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.KNOWLEDGE_BASE, 1L), true).getBody())
                .isEqualTo("库描述");
        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.MOOC, 2L), true).getBody()).isEqualTo("课描述");
        assertThat(service.get(KnowledgeRef.of(KnowledgeEntityType.TASK, 3L), true).getBody()).isEqualTo("任务描述");
    }

    /**
     * 导出按扫描 id 推进并正确报告 hasMore。
     */
    @Test
    void exportsNotePageWithNextCursor() {
        List<Note> notes = List.of(note(1L), note(2L), note(3L));
        when(noteMapper.selectList(any())).thenReturn(notes);
        notes.forEach(note -> {
            when(noteMapper.selectById(note.getId())).thenReturn(note);
            NoteText text = new NoteText();
            text.setId(note.getNoteTextId());
            text.setContent("正文" + note.getId());
            when(noteTextMapper.selectById(note.getNoteTextId())).thenReturn(text);
        });

        KnowledgeExportVO page = service.export("note", null, 0L, 2);
        assertThat(page.getDocuments()).hasSize(2);
        assertThat(page.isHasMore()).isTrue();
        assertThat(page.getNextAfterId()).isEqualTo(2L);
    }

    /**
     * 当前页总结为空时仍返回最后扫描条目 id，避免重复扫描。
     */
    @Test
    void exportAdvancesWhenSummaryIsMissing() {
        MoocItemPO item = MoocItemPO.builder().id(4L).moocId(2L).moocItemType(1).build();
        MoocItemPO next = MoocItemPO.builder().id(5L).moocId(2L).moocItemType(1).build();
        when(itemMapper.selectList(any())).thenReturn(List.of(item, next));
        videoItem(4L, 2L);
        when(summarizeService.getMoocVideoSummarizesByMoocItemId(anyString(), any()))
                .thenReturn(ResData.success(List.of()));

        KnowledgeExportVO page = service.export("summary", null, 0L, 1);
        assertThat(page.getDocuments()).isEmpty();
        assertThat(page.isHasMore()).isTrue();
        assertThat(page.getNextAfterId()).isEqualTo(4L);
    }

    /**
     * 按复合引用批量读取源文档，去重并返回缺失引用列表；超过 100 条拒绝请求。
     */
    @Test
    void getsDocumentsInBatchAndReportsMissingRefs() {
        Note found = note(1L);
        when(noteMapper.selectById(1L)).thenReturn(found);
        NoteText text = new NoteText();
        text.setId(found.getNoteTextId());
        text.setContent("正文1");
        when(noteTextMapper.selectById(found.getNoteTextId())).thenReturn(text);

        videoItem(4L, 2L);
        when(videoInfoMapper.selectOne(any())).thenReturn(MoocVideoItemInfoPO.builder()
                .moocItemId(4L).srtObjectName("srt/a.srt").build());
        when(fileService.readTextFile(anyString(), anyString())).thenReturn(ResData.success("字幕正文"));

        KnowledgeDocumentBatchVO batch = service.getBatch(
                List.of("note:1", "note:1", "mooc_item:4#transcript", "note:999"), true);
        assertThat(batch.getDocuments()).hasSize(2);
        assertThat(batch.getDocuments().get(0).getRef()).isEqualTo("note:1");
        assertThat(batch.getDocuments().get(1).getRef()).isEqualTo("mooc_item:4");
        assertThat(batch.getDocuments().get(1).getSubtype()).isEqualTo("transcript");
        assertThat(batch.getMissingRefs()).containsExactly("note:999");

        List<String> oversized = IntStream.rangeClosed(1, 101).mapToObj(i -> "note:" + i).toList();
        assertThatThrownBy(() -> service.getBatch(oversized, true))
                .isInstanceOf(BusinessException.class).hasMessage("单次请求数量超出限制");
    }

    /**
     * 笔记服务拒绝导出由通知服务管理的 notice 实体。
     */
    @Test
    void rejectsNoticeExportInNoteService() {
        assertThatThrownBy(() -> service.export("notice", null, 0L, 10))
                .isInstanceOf(BusinessException.class).hasMessage("知识实体参数不合法");
    }

    private Note note(Long id) {
        return Note.builder().id(id).noteTextId(id + 100).title("笔记" + id).knowledgeBaseId(3L)
                .status(0).permissions("70000").dataScope(1).build();
    }

    private void videoItem(Long itemId, Long moocId) {
        when(itemMapper.selectById(itemId)).thenReturn(MoocItemPO.builder().id(itemId).moocId(moocId)
                .moocItemType(1).title("视频").build());
        when(moocMapper.selectById(moocId)).thenReturn(MoocPO.builder().id(moocId).knowledgeBaseId(3L)
                .permissions("77400").dataScope(3).build());
    }
}
