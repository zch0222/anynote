package com.anynote.note.service;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.note.api.model.po.Note;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link NoteChangePublisher} 单元测试：消息在事务提交后发出，通知失败不影响写入。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteChangePublisherTest {

    @Mock
    private RocketMQTemplate rocketMQTemplate;

    @Mock
    private RocketMQProperties rocketMQProperties;

    @Mock
    private ObjectProvider<StringRedisTemplate> redisProvider;

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    private NoteChangePublisher publisher;

    @BeforeEach
    void setUp() {
        when(rocketMQProperties.getNoteTopic()).thenReturn("note-topic");
        when(redisProvider.getIfAvailable()).thenReturn(stringRedisTemplate);
        publisher = new NoteChangePublisher(rocketMQTemplate, rocketMQProperties, redisProvider);
    }

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static Note note(String content) {
        return Note.builder().id(1L).title("t").content(content).build();
    }

    @Test
    @DisplayName("不在事务中时立即发出索引与编辑日志消息")
    void sendsImmediatelyWithoutTransaction() {
        publisher.publishSaved(1L, note("旧"), note("新"), 7L);

        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATOR_NOTE_INDEX"), eq(1L), any());
        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATE_NOTE_EDIT_LOG"), anyString(), any());
    }

    @Test
    @DisplayName("事务中不提前发送，提交后才发出")
    void sendsAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();

        publisher.publishSaved(1L, note("旧"), note("新"), 7L);
        publisher.publishExternalUpdate(1L, 7L);
        verify(rocketMQTemplate, never()).asyncSend(anyString(), any(Object.class), any());
        verify(stringRedisTemplate, never()).convertAndSend(anyString(), anyString());

        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }
        verify(rocketMQTemplate).asyncSend(eq("note-topic:GENERATOR_NOTE_INDEX"), eq(1L), any());
        verify(stringRedisTemplate).convertAndSend(eq("collab:note-updated:1"), startsWith("{\"actorId\":7"));
    }

    @Test
    @DisplayName("通知发布失败只记日志，不向写入方抛错")
    void swallowsNotifyFailure() {
        doThrow(new RedisConnectionFailureException("down"))
                .when(stringRedisTemplate).convertAndSend(anyString(), anyString());

        assertThatCode(() -> publisher.publishExternalUpdate(1L, 7L)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("没有 Redis 时不发布通知")
    void skipsNotifyWithoutRedis() {
        when(redisProvider.getIfAvailable()).thenReturn(null);

        assertThatCode(() -> publisher.publishExternalUpdate(1L, 7L)).doesNotThrowAnyException();
        verify(stringRedisTemplate, never()).convertAndSend(anyString(), anyString());
    }
}
