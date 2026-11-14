package com.anynote.note.listener;

import com.anynote.ai.api.RemoteTranslateService;
import com.anynote.ai.api.model.dto.TranslateTextDTO;
import com.anynote.common.rocketmq.tags.DocTagsEnum;
import com.anynote.core.utils.RemoteResDataUtil;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.service.DocService;
import com.anynote.note.service.KnowledgeChangeService;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.common.message.MessageExt;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;
import java.util.ArrayList;
import java.util.List;

/**
 * 资料消息监听器。
 *
 * @author 称霸幼儿园
 */
@Component
@Slf4j
@RocketMQMessageListener(topic = "${anynote.data.rocketmq.doc-topic}",
        consumerGroup = "${anynote.data.rocketmq.doc-group}", maxReconsumeTimes = 2)
public class DocMessageListener implements RocketMQListener<MessageExt> {

    @Resource
    private DocService docService;

    @Resource
    private RemoteTranslateService remoteTranslateService;

    @Resource
    private KnowledgeChangeService knowledgeChangeService;

    @Override
    public void onMessage(MessageExt messageExt) {
        DocTagsEnum docTagsEnum = DocTagsEnum.valueOf(messageExt.getTags());
        if (DocTagsEnum.RAG_INDEX.equals(docTagsEnum)) {
            Long docId = Long.valueOf(new String(messageExt.getBody()));
            log.info("登记文档重新索引变更, 文档ID: {}", docId);
            indexDoc(docId);
        }
        else if (DocTagsEnum.TRANSLATE_DOC_NAME_TO_ENGLISH.equals(docTagsEnum)) {
            Long docId = Long.valueOf(new String(messageExt.getBody()));
            log.info("翻译文档名称为英文，文档ID: {}", docId);
            translateDocName2English(docId);
        }
    }

    /**
     * 登记资料重新索引变更。
     *
     * @param docId 资料 id
     */
    private void indexDoc(Long docId) {
        Doc doc = docService.getBaseMapper().selectById(docId);
        knowledgeChangeService.record(KnowledgeEntityType.DOC, docId,
                doc.getKnowledgeBaseId(), KnowledgeOperation.UPDATE);
    }

    private void translateDocName2English(Long docId) {
        Doc doc = docService.getBaseMapper().selectById(docId);
        List<String> name = new ArrayList<>(1);
        name.add(doc.getName());
        String englishName = RemoteResDataUtil.getResData(remoteTranslateService.translateText(TranslateTextDTO.builder().text(name).targetLang("EN").build(),
                "inner"), "翻译失败").get(0).getText();
        doc.setEnglishName(englishName);
        docService.getBaseMapper().updateById(doc);
    }
}
