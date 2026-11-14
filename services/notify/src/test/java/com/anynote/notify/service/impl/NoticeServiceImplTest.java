package com.anynote.notify.service.impl;

import com.anynote.common.redis.service.RedisService;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeBaseService;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import com.anynote.note.api.model.dto.NoteKnowledgeBaseDTO;
import com.anynote.notify.api.enmus.NoticeType;
import com.anynote.notify.api.model.bo.NoticePublishParam;
import com.anynote.notify.api.model.po.KnowledgeBaseNotice;
import com.anynote.notify.api.model.po.Notice;
import com.anynote.notify.mapper.KnowledgeBaseNoticeMapper;
import com.anynote.notify.mapper.NoticeMapper;
import com.anynote.notify.service.UserNoticeService;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 通知发布及知识库通知变更登记单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class NoticeServiceImplTest {

    @Mock
    private NoticeMapper noticeMapper;
    @Mock
    private UserNoticeService userNoticeService;
    @Mock
    private KnowledgeBaseNoticeMapper knowledgeBaseNoticeMapper;
    @Mock
    private RedisService redisService;
    @Spy
    private Gson gson = new Gson();
    @Mock
    private RemoteKnowledgeBaseService remoteKnowledgeBaseService;
    @Mock
    private RemoteKnowledgeService remoteKnowledgeService;

    @InjectMocks
    private NoticeServiceImpl service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "baseMapper", noticeMapper);
    }

    /**
     * 发布知识库通知后自动登记 NOTICE CREATE 变更，且变更服务异常不影响发布返回。
     */
    @Test
    void publishKnowledgeBaseNoticeRecordsChangeSafely() {
        when(noticeMapper.insert(any(Notice.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, Notice.class).setId(66L);
            return 1;
        });
        NoteKnowledgeBaseDTO kbDto = new NoteKnowledgeBaseDTO();
        kbDto.setId(5L);
        kbDto.setKnowledgeBaseName("测试库");
        when(remoteKnowledgeBaseService.innerGetKnowledgeBaseById(5L, "inner"))
                .thenReturn(ResData.success(kbDto));
        when(remoteKnowledgeService.recordChange(any(KnowledgeChangeRecordDTO.class), eq(SecurityConstants.INNER)))
                .thenReturn(ResData.success(100L));

        NoticePublishParam param = NoticePublishParam.builder()
                .title("测试公告")
                .content("公告正文")
                .type(NoticeType.KNOWLEDGE_BASE.getType())
                .status(0)
                .level(0)
                .knowledgeBaseId(5L)
                .userIdList(List.of(7L))
                .createBy(1L)
                .createTime(new Date())
                .updateBy(1L)
                .updateTime(new Date())
                .build();

        Long noticeId = service.publishNotice(param);
        assertThat(noticeId).isEqualTo(66L);
        verify(knowledgeBaseNoticeMapper).insert(any(KnowledgeBaseNotice.class));
        verify(remoteKnowledgeService).recordChange(
                argThat((KnowledgeChangeRecordDTO dto) -> "notice".equals(dto.getEntityType())
                        && Long.valueOf(66L).equals(dto.getEntityId())
                        && Long.valueOf(5L).equals(dto.getKnowledgeBaseId())
                        && "CREATE".equals(dto.getOperation())),
                eq(SecurityConstants.INNER));

        doThrow(new RuntimeException("note service down"))
                .when(remoteKnowledgeService)
                .recordChange(any(KnowledgeChangeRecordDTO.class), eq(SecurityConstants.INNER));
        assertThat(service.publishNotice(param)).isEqualTo(66L);
    }
}
