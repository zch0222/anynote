package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.enums.DocIndexStatus;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.KnowledgeChangeMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.model.po.KnowledgeChangePO;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.vo.KnowledgeChangePageVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 知识变更记录、游标和索引状态单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class KnowledgeChangeServiceImplTest {

    @Mock
    private KnowledgeChangeMapper changeMapper;
    @Mock
    private DocMapper docMapper;
    @Mock
    private MoocItemMapper itemMapper;
    @Mock
    private MoocMapper moocMapper;

    private KnowledgeChangeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new KnowledgeChangeServiceImpl(changeMapper, docMapper, itemMapper, moocMapper);
    }

    /**
     * 插入变更时使用稳定的小写实体类型与大写操作。
     */
    @Test
    void recordsChange() {
        when(changeMapper.insert(any(KnowledgeChangePO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, KnowledgeChangePO.class).setId(9L);
            return 1;
        });

        Long id = service.record(KnowledgeEntityType.NOTE, 3L, 2L, KnowledgeOperation.CREATE);

        ArgumentCaptor<KnowledgeChangePO> captor = ArgumentCaptor.forClass(KnowledgeChangePO.class);
        verify(changeMapper).insert(captor.capture());
        assertThat(id).isEqualTo(9L);
        assertThat(captor.getValue().getEntityType()).isEqualTo("note");
        assertThat(captor.getValue().getOperation()).isEqualTo("CREATE");
        assertThat(captor.getValue().getKnowledgeBaseId()).isEqualTo(2L);
    }

    /**
     * 空页延续请求游标，非空页使用最后一条 id。
     */
    @Test
    void readsCursorPages() {
        KnowledgeChangePO change = KnowledgeChangePO.builder().id(4L).entityType("doc")
                .entityId(8L).knowledgeBaseId(2L).operation("UPDATE").createTime(new Date()).build();
        when(changeMapper.selectAfter(2L, 2)).thenReturn(List.of(change));
        when(changeMapper.selectLatest()).thenReturn(change);

        KnowledgeChangePageVO page = service.changes(2L, 2);
        assertThat(page.getNextCursor()).isEqualTo(4L);
        assertThat(page.getLatestCursor()).isEqualTo(4L);
        assertThat(page.getChanges()).hasSize(1);

        when(changeMapper.selectAfter(4L, 2)).thenReturn(List.of());
        assertThat(service.changes(4L, 2).getNextCursor()).isEqualTo(4L);
    }

    /**
     * 索引状态接受 0..4 五种值（含 UNEXTRACTABLE），其余值使用确认的错误文案。
     */
    @Test
    void validatesIndexStatus() {
        when(docMapper.updateById(any(Doc.class))).thenReturn(1);
        service.updateDocIndexStatus(1L, DocIndexStatus.INDEXED.getValue());
        verify(docMapper).updateById(argThat((Doc doc) -> doc.getIndexStatus() == 0));

        service.updateDocIndexStatus(1L, DocIndexStatus.UNEXTRACTABLE.getValue());
        verify(docMapper).updateById(argThat((Doc doc) -> doc.getIndexStatus() == 4));

        assertThatThrownBy(() -> service.updateDocIndexStatus(1L, 5))
                .isInstanceOf(BusinessException.class).hasMessage("资料索引状态不合法");
    }

    /**
     * 登记外部知识变更请求支持 notice 类型，并对非法类型或操作抛出统一业务异常。
     */
    @Test
    void recordsExternalNoticeChangeRequest() {
        when(changeMapper.insert(any(KnowledgeChangePO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, KnowledgeChangePO.class).setId(12L);
            return 1;
        });

        Long id = service.record(KnowledgeChangeRecordDTO.builder()
                .entityType("notice")
                .entityId(8L)
                .knowledgeBaseId(3L)
                .operation("CREATE")
                .build());
        assertThat(id).isEqualTo(12L);
        verify(changeMapper).insert(argThat((KnowledgeChangePO change) ->
                "notice".equals(change.getEntityType()) && change.getEntityId() == 8L
                        && change.getKnowledgeBaseId() == 3L && "CREATE".equals(change.getOperation())));

        assertThatThrownBy(() -> service.record(KnowledgeChangeRecordDTO.builder()
                .entityType("notice").entityId(8L).knowledgeBaseId(3L).operation("INVALID").build()))
                .isInstanceOf(BusinessException.class).hasMessage("知识实体参数不合法");
    }

    /**
     * 插入知识变更后尽力发布 Redis 唤醒消息，Redis 异常不影响落库结果。
     */
    @Test
    @SuppressWarnings("unchecked")
    void publishesRedisWakeupBestEffortAfterRecord() {
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        when(provider.getIfAvailable()).thenReturn(redisTemplate);
        KnowledgeChangeServiceImpl wakeupService = new KnowledgeChangeServiceImpl(
                changeMapper, docMapper, itemMapper, moocMapper, provider);

        when(changeMapper.insert(any(KnowledgeChangePO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, KnowledgeChangePO.class).setId(15L);
            return 1;
        });

        Long id = wakeupService.record(KnowledgeEntityType.NOTE, 3L, 2L, KnowledgeOperation.UPDATE);
        assertThat(id).isEqualTo(15L);
        verify(redisTemplate).convertAndSend(eq(KnowledgeChangeServiceImpl.CHANGE_WAKEUP_CHANNEL), anyString());

        doThrow(new RuntimeException("redis down"))
                .when(redisTemplate).convertAndSend(eq(KnowledgeChangeServiceImpl.CHANGE_WAKEUP_CHANNEL), anyString());
        assertThat(wakeupService.record(KnowledgeEntityType.NOTE, 4L, 2L, KnowledgeOperation.DELETE))
                .isEqualTo(15L);
    }

    /**
     * 视频总结变更使用条目 id 和所属慕课知识库。
     */
    @Test
    void recordsSummaryWithParentKnowledgeBase() {
        when(itemMapper.selectById(6L)).thenReturn(MoocItemPO.builder().id(6L).moocId(3L).build());
        when(moocMapper.selectById(3L)).thenReturn(MoocPO.builder().id(3L).knowledgeBaseId(2L).build());
        when(changeMapper.insert(any(KnowledgeChangePO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, KnowledgeChangePO.class).setId(7L);
            return 1;
        });

        assertThat(service.recordSummaryChange(6L)).isEqualTo(7L);
        verify(changeMapper).insert(argThat((KnowledgeChangePO change) ->
                change.getEntityType().equals("summary") && change.getEntityId() == 6L
                        && change.getKnowledgeBaseId() == 2L));
    }

}
