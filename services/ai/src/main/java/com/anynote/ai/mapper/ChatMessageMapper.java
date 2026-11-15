package com.anynote.ai.mapper;

import com.anynote.ai.api.model.po.ChatMessage;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ChatMessageMapper extends BaseMapper<ChatMessage> {

    /**
     * 按会话读取未删除消息。
     *
     * @param conversationId 会话标识
     * @return 按消息序号排列的会话消息
     */
    List<ChatMessage> selectConversationMessages(@Param("conversationId") Long conversationId);

    /**
     * 按运行标识读取助手消息。
     *
     * @param runId 运行标识
     * @return 助手消息，不存在时返回 null
     */
    ChatMessage selectAssistantByRunId(@Param("runId") String runId);
}
