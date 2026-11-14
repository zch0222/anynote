package com.anynote.notify.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.notify.mapper.NoticeMapper;
import com.anynote.notify.model.dto.KnowledgeNoticeBatchDTO;
import com.anynote.notify.model.dto.KnowledgeNoticeExportDTO;
import com.anynote.notify.model.po.KnowledgeNoticeExportPO;
import com.anynote.notify.model.vo.KnowledgeNoticeBatchVO;
import com.anynote.notify.model.vo.KnowledgeNoticeExportVO;
import com.anynote.notify.model.vo.KnowledgeNoticeVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Date;
import java.util.List;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * 知识库通知导出与批量读取服务单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class KnowledgeNoticeServiceImplTest {

    @Mock
    private NoticeMapper noticeMapper;

    private KnowledgeNoticeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new KnowledgeNoticeServiceImpl(noticeMapper);
    }

    /**
     * 导出仅返回有效知识库通知，且已关闭通知不阻塞游标推进。
     */
    @Test
    void exportsActiveNoticesAndAdvancesCursorPastClosedRows() {
        KnowledgeNoticeExportPO closed = row(1L, 1, 1, 0, 10L);
        KnowledgeNoticeExportPO active = row(2L, 1, 0, 0, 10L);
        KnowledgeNoticeExportPO next = row(3L, 1, 0, 0, 10L);
        when(noticeMapper.selectKnowledgeNoticesPage(0L, 3)).thenReturn(List.of(closed, active, next));

        KnowledgeNoticeExportDTO request = new KnowledgeNoticeExportDTO();
        request.setAfterId(0L);
        request.setLimit(2);

        KnowledgeNoticeExportVO page = service.export(request);
        assertThat(page.isHasMore()).isTrue();
        assertThat(page.getNextAfterId()).isEqualTo(2L);
        assertThat(page.getDocuments()).hasSize(1);

        KnowledgeNoticeVO doc = page.getDocuments().get(0);
        assertThat(doc.getRef()).isEqualTo("notice:2");
        assertThat(doc.getKbId()).isEqualTo(10L);
        assertThat(doc.getParentRef()).isEqualTo("kb:10");
        assertThat(doc.getFormat()).isEqualTo("plain_text");
        assertThat(doc.getAuthority()).isEqualTo("authoritative");
        assertThat(doc.getAcl().getPermissions()).isEqualTo("77400");
        assertThat(doc.getAcl().getDataScope()).isEqualTo(3);
        assertThat(doc.getContentVersion()).isNotBlank();
        assertThat(doc.getMetaVersion()).isNotBlank();
    }

    /**
     * 批量读取去重返回有效通知并把已关闭或缺失的 id 放入 missingIds。
     */
    @Test
    void batchReturnsActiveAndMissingIds() {
        when(noticeMapper.selectKnowledgeNoticesByIds(List.of(2L, 9L)))
                .thenReturn(List.of(row(2L, 1, 0, 0, 10L)));

        KnowledgeNoticeBatchDTO request = new KnowledgeNoticeBatchDTO();
        request.setIds(List.of(2L, 2L, 9L));

        KnowledgeNoticeBatchVO result = service.getBatch(request);
        assertThat(result.getDocuments()).hasSize(1);
        assertThat(result.getDocuments().get(0).getEntityId()).isEqualTo(2L);
        assertThat(result.getMissingIds()).containsExactly(9L);
    }

    /**
     * 非法游标、空列表和超出上限的参数触发确认错误文案。
     */
    @Test
    void validatesExportAndBatchLimits() {
        KnowledgeNoticeExportDTO negativeAfter = new KnowledgeNoticeExportDTO();
        negativeAfter.setAfterId(-1L);
        assertThatThrownBy(() -> service.export(negativeAfter))
                .isInstanceOf(BusinessException.class).hasMessage("通知查询参数不合法");

        KnowledgeNoticeExportDTO overLimit = new KnowledgeNoticeExportDTO();
        overLimit.setLimit(201);
        assertThatThrownBy(() -> service.export(overLimit))
                .isInstanceOf(BusinessException.class).hasMessage("单次导出数量超出限制");

        KnowledgeNoticeBatchDTO emptyBatch = new KnowledgeNoticeBatchDTO();
        emptyBatch.setIds(List.of());
        assertThatThrownBy(() -> service.getBatch(emptyBatch))
                .isInstanceOf(BusinessException.class).hasMessage("通知查询参数不合法");

        KnowledgeNoticeBatchDTO hugeBatch = new KnowledgeNoticeBatchDTO();
        hugeBatch.setIds(LongStream.rangeClosed(1L, 101L).boxed().toList());
        assertThatThrownBy(() -> service.getBatch(hugeBatch))
                .isInstanceOf(BusinessException.class).hasMessage("单次导出数量超出限制");
    }

    private KnowledgeNoticeExportPO row(Long id, int type, int status, int deleted, Long kbId) {
        return KnowledgeNoticeExportPO.builder()
                .id(id)
                .title("公告" + id)
                .content("正文" + id)
                .type(type)
                .status(status)
                .level(0)
                .deleted(deleted)
                .knowledgeBaseId(kbId)
                .createBy(7L)
                .createTime(new Date(1000L))
                .updateBy(7L)
                .updateTime(new Date(2000L))
                .build();
    }
}
