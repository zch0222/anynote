package com.anynote.ai.service;

import com.anynote.ai.api.model.bo.ChatConversationDeleteParam;
import com.anynote.ai.api.model.bo.ChatConversationQueryParam;
import com.anynote.ai.api.model.bo.ChatConversationUpdateParam;
import com.anynote.ai.api.model.dto.ChatCompletionsDTO;
import com.anynote.ai.api.model.dto.ChatConversationListDTO;
import com.anynote.ai.model.dto.MoocVideoSummarizeDTO;
import com.anynote.ai.model.dto.NoteTaskSubmissionAnalyzeDTO;
import com.anynote.ai.model.vo.ChatConversationInfoVO;
import com.anynote.ai.model.vo.ChatConversationVO;
import com.anynote.ai.run.AiCallContext;
import com.anynote.core.web.model.bo.PageBean;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * AI 对话与相关总结能力。
 *
 * @author 称霸幼儿园
 */
public interface ChatService {

    /**
     * 新建会话并发起一次流式问答。
     *
     * @param chatCompletionsDTO 问答请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter chatCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context);

    /**
     * 已有会话的流式问答，调用前做会话权限校验。
     *
     * @param chatCompletionsDTO 问答请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter authedChatCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context);

    /**
     * 不落会话的流式问答。
     *
     * @param chatCompletionsDTO 问答请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter chatNoConversationCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context);

    /**
     * 慕课字幕总结，流式返回总结内容并在结束后落库。
     *
     * @param moocVideoSummarizeDTO 总结请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter moocVideoSummarize(MoocVideoSummarizeDTO moocVideoSummarizeDTO, AiCallContext context);

    /**
     * 笔记任务提交情况分析。
     *
     * @param noteTaskSubmissionAnalyzeDTO 分析请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter noteTaskSubmissionAnalyze(NoteTaskSubmissionAnalyzeDTO noteTaskSubmissionAnalyzeDTO,
                                        AiCallContext context);

    /**
     * 根据 id 获取会话与消息。
     *
     * @param queryParam 查询参数
     * @return 会话详情
     */
    ChatConversationVO getChatConversationById(ChatConversationQueryParam queryParam);

    /**
     * 分页查询当前用户的会话列表。
     *
     * @param chatConversationListDTO 分页参数
     * @param context 调用身份上下文
     * @return 会话分页
     */
    PageBean<ChatConversationInfoVO> getChatConversationList(ChatConversationListDTO chatConversationListDTO,
                                                             AiCallContext context);

    /**
     * 更新会话标题。
     *
     * @param updateParam 更新参数
     * @param context 调用身份上下文
     * @return 操作结果
     */
    String updateChatConversation(ChatConversationUpdateParam updateParam, AiCallContext context);

    /**
     * 删除会话。
     *
     * @param deleteParam 删除参数
     * @return 是否删除成功
     */
    boolean deleteChatConversationById(ChatConversationDeleteParam deleteParam);
}
