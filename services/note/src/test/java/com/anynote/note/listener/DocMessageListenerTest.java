package com.anynote.note.listener;

import com.anynote.note.api.model.po.Doc;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.service.DocService;
import com.anynote.note.service.KnowledgeChangeService;
import org.apache.rocketmq.common.message.MessageExt;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 资料重新索引消息只登记知识变更的单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class DocMessageListenerTest {

    @Mock private DocService docService;
    @Mock private DocMapper docMapper;
    @Mock private KnowledgeChangeService knowledgeChangeService;

    /**
     * RAG_INDEX 消息写入资料 UPDATE 记录。
     */
    @Test
    void ragIndexMessageRecordsChange() {
        DocMessageListener listener = new DocMessageListener();
        ReflectionTestUtils.setField(listener, "docService", docService);
        ReflectionTestUtils.setField(listener, "knowledgeChangeService", knowledgeChangeService);
        when(docService.getBaseMapper()).thenReturn(docMapper);
        when(docMapper.selectById(3L)).thenReturn(Doc.builder().id(3L).knowledgeBaseId(2L).build());
        MessageExt message = new MessageExt();
        message.setTags("RAG_INDEX");
        message.setBody("3".getBytes(StandardCharsets.UTF_8));

        listener.onMessage(message);

        verify(knowledgeChangeService).record(KnowledgeEntityType.DOC, 3L, 2L, KnowledgeOperation.UPDATE);
    }
}
