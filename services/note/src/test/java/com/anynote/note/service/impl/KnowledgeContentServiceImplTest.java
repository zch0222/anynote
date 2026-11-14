package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeContentDTO;
import com.anynote.note.model.vo.KnowledgeContentVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.system.api.model.bo.LoginUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 正文标题、行、字幕时间与续读单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class KnowledgeContentServiceImplTest {

    @Mock
    private KnowledgeEntityService entityService;
    @Mock
    private KnowledgeAccessService accessService;

    private KnowledgeContentServiceImpl service;
    private LoginUser user;

    @BeforeEach
    void setUp() {
        service = new KnowledgeContentServiceImpl(entityService, accessService);
        user = new LoginUser();
        user.setUserId(7L);
        lenient().when(accessService.isReadable(any(), any())).thenReturn(true);
    }

    /**
     * Markdown 行范围保留 CRLF，标题段在下一个同级标题前结束。
     */
    @Test
    void readsMarkdownHeadingAndLineRange() {
        markdown("# 一\r\n甲\r\n## 二\r\n乙\r\n# 三\r\n丙\r\n");
        KnowledgeContentDTO request = request("note:1", null);
        request.setHeading("一");

        assertThat(service.read(user, request).getContent()).isEqualTo("# 一\r\n甲\r\n## 二\r\n乙\r\n");

        request = request("note:1", null);
        request.setStartLine(3);
        request.setEndLine(4);
        assertThat(service.read(user, request).getContent()).isEqualTo("## 二\r\n乙\r\n");
    }

    /**
     * 超过上限时返回 nextOffset，续读得到剩余内容。
     */
    @Test
    void truncatesAndContinuesByOffset() {
        markdown("x".repeat(20_001));
        KnowledgeContentDTO request = request("note:1", null);

        KnowledgeContentVO first = service.read(user, request);
        request.setOffset(first.getNextOffset());
        KnowledgeContentVO second = service.read(user, request);

        assertThat(first.getContent()).hasSize(20_000);
        assertThat(first.isTruncated()).isTrue();
        assertThat(first.getNextOffset()).isEqualTo(20_000);
        assertThat(second.getContent()).isEqualTo("x");
        assertThat(second.isTruncated()).isFalse();
        assertThat(second.getNextOffset()).isNull();
    }

    /**
     * 字幕返回与时间范围有重叠的条目。
     */
    @Test
    void readsOverlappingSrtEntries() {
        KnowledgeSourceDocumentVO document = document("srt", "1\n00:00:01,000 --> 00:00:02,000\n甲\n\n"
                + "2\n00:00:03,000 --> 00:00:04,000\n乙\n");
        when(entityService.get(any(), eq(true))).thenReturn(document);
        KnowledgeContentDTO request = request("mooc_item:1", "transcript");
        request.setStartTimeMs(2_000L);
        request.setEndTimeMs(3_000L);

        assertThat(service.read(user, request).getContent()).contains("甲").contains("乙");
    }

    /**
     * 不可读和非法范围分别使用确认的文案。
     */
    @Test
    void rejectsUnreadableAndInvalidRange() {
        markdown("正文");
        when(accessService.isReadable(any(), any())).thenReturn(false);
        assertThatThrownBy(() -> service.read(user, request("note:1", null)))
                .isInstanceOf(BusinessException.class).hasMessage("知识内容不存在或不可读");

        when(accessService.isReadable(any(), any())).thenReturn(true);
        KnowledgeContentDTO request = request("note:1", null);
        request.setStartLine(2);
        assertThatThrownBy(() -> service.read(user, request))
                .isInstanceOf(BusinessException.class).hasMessage("正文读取范围不合法");
    }

    private void markdown(String body) {
        when(entityService.get(any(), eq(true)))
                .thenReturn(document("markdown", body));
    }

    private KnowledgeSourceDocumentVO document(String format, String body) {
        return KnowledgeSourceDocumentVO.builder()
                .ref("note:1").entityType("note").kbId(1L).title("标题").format(format)
                .body(body).authority("original").contentVersion("c").metaVersion("m").build();
    }

    private KnowledgeContentDTO request(String ref, String subtype) {
        KnowledgeContentDTO request = new KnowledgeContentDTO();
        request.setRef(ref);
        request.setSubtype(subtype);
        return request;
    }
}
