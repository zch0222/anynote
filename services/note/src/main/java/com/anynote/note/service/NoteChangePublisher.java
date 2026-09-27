package com.anynote.note.service;

import com.alibaba.fastjson2.JSON;
import com.anynote.common.rocketmq.callback.RocketmqSendCallbackBuilder;
import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.rocketmq.tags.NoteTagsEnum;
import com.anynote.note.api.model.bo.GenerateNoteEditLogMessage;
import com.anynote.note.api.model.po.Note;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 笔记写入后的消息发布：ES 索引、编辑日志（RocketMQ）与协同外部写入通知（Redis）。
 *
 * <p>公开编辑与协同服务写回共用这一处，保证两条写入路径发出同样的消息。
 * 当前处于事务中时，消息在事务提交之后发送，回滚的写入不会产生消息。</p>
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Component
public class NoteChangePublisher {

    /** 外部写入通知的频道前缀，完整频道为 {@code collab:note-updated:<noteId>}。 */
    public static final String EXTERNAL_UPDATE_CHANNEL_PREFIX = "collab:note-updated:";

    private final RocketMQTemplate rocketMQTemplate;

    private final RocketMQProperties rocketMQProperties;

    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;

    public NoteChangePublisher(RocketMQTemplate rocketMQTemplate,
                               RocketMQProperties rocketMQProperties,
                               ObjectProvider<StringRedisTemplate> redisTemplateProvider) {
        this.rocketMQTemplate = rocketMQTemplate;
        this.rocketMQProperties = rocketMQProperties;
        this.redisTemplateProvider = redisTemplateProvider;
    }

    /**
     * 发布一次正文保存：重建 ES 索引，并生成编辑日志与历史版本。
     *
     * @param noteId      笔记id
     * @param oldNote     保存前的笔记（含正文）
     * @param currentNote 保存后的笔记（含正文）
     * @param userId      编辑日志与历史记到的用户
     */
    public void publishSaved(Long noteId, Note oldNote, Note currentNote, Long userId) {
        String indexDestination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.GENERATOR_NOTE_INDEX.name();
        String editLogDestination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.GENERATE_NOTE_EDIT_LOG.name();
        String editLog = JSON.toJSONString(GenerateNoteEditLogMessage.builder()
                .noteId(noteId)
                .oldNote(oldNote)
                .currentNote(currentNote)
                .date(new Date())
                .userId(userId)
                .build());
        runAfterCommit(() -> {
            rocketMQTemplate.asyncSend(indexDestination, noteId, RocketmqSendCallbackBuilder.commonCallback());
            rocketMQTemplate.asyncSend(editLogDestination, editLog, RocketmqSendCallbackBuilder.commonCallback());
        });
    }

    /**
     * 通知协同服务：这篇笔记被协同房间以外的写入方修改了，在线房间应回读并合并。
     *
     * <p>通知只用于加速合并，发布失败只记日志，不影响本次写入。</p>
     *
     * @param noteId  笔记id
     * @param actorId 写入者id
     */
    public void publishExternalUpdate(Long noteId, Long actorId) {
        runAfterCommit(() -> {
            StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
            if (redisTemplate == null) {
                return;
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("actorId", actorId);
            payload.put("at", System.currentTimeMillis());
            try {
                redisTemplate.convertAndSend(EXTERNAL_UPDATE_CHANNEL_PREFIX + noteId, JSON.toJSONString(payload));
            } catch (RuntimeException e) {
                log.warn("笔记 {} 的外部写入通知发布失败，协同房间将在下次写回时发现该写入", noteId, e);
            }
        });
    }

    /** 事务中则等提交后执行，否则立即执行。 */
    private void runAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }
}
