package com.anynote.ai.controller;

import com.anynote.ai.api.model.bo.ChatConversationDeleteParam;
import com.anynote.ai.api.model.bo.ChatConversationQueryParam;
import com.anynote.ai.api.model.bo.ChatConversationUpdateParam;
import com.anynote.ai.api.model.dto.ChatCompletionsDTO;
import com.anynote.ai.api.model.dto.ChatConversationListDTO;
import com.anynote.ai.api.model.dto.ChatConversationUpdateDTO;
import com.anynote.ai.model.dto.MoocVideoSummarizeDTO;
import com.anynote.ai.model.dto.NoteTaskSubmissionAnalyzeDTO;
import com.anynote.ai.model.vo.ChatCompletionsEventVO;
import com.anynote.ai.model.vo.ChatConversationInfoVO;
import com.anynote.ai.model.vo.ChatConversationVO;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.service.ChatService;
import com.anynote.common.security.token.AccessTokenProvider;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.constant.Constants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.Resource;
import jakarta.validation.Valid;

/**
 * AI 对话 Controller。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "AI对话", description = "SSE流式AI对话接口")
@RestController
@RequestMapping("chat")
@Slf4j
public class ChatController {

    @Resource
    private ChatService chatService;

    @Resource
    private TokenUtil tokenUtil;

    @Resource
    private AccessTokenProvider accessTokenProvider;

    @DeleteMapping("conversations/{id}")
    public ResData<String> deleteConversation(@PathVariable("id") Long id) {
        chatService.deleteChatConversationById(ChatConversationDeleteParam.builder()
                .conversationId(id)
                .build());
        return ResUtil.success(Constants.SUCCESS_RES);
    }

    @Operation(summary = "对话列表")
    @GetMapping("conversations/list")
    public ResData<PageBean<ChatConversationInfoVO>> getChatConversationList(
            @Valid ChatConversationListDTO chatConversationListDTO) {
        return ResData.success(chatService.getChatConversationList(chatConversationListDTO, currentContext()));
    }

    @Operation(summary = "根据id获取对话")
    @GetMapping(path = "conversations/{id}")
    public ResData<ChatConversationVO> getChatConversationById(@PathVariable("id") Long id) {
        return ResUtil.success(chatService.getChatConversationById(ChatConversationQueryParam.builder()
                .conversationId(id)
                .build()));
    }

    @Operation(summary = "更新对话")
    @PatchMapping("conversations/{id}")
    public ResData<String> updateChatConversation(@PathVariable("id") Long id,
                                                  @Valid @RequestBody ChatConversationUpdateDTO chatConversationUpdateDTO) {
        return ResData.success(chatService.updateChatConversation(ChatConversationUpdateParam
                .ChatConversationUpdateParamBuilder()
                .conversationId(id)
                .title(chatConversationUpdateDTO.getTitle())
                .build(), currentContext()));
    }

    /**
     * AI 助手问答接口，按 conversationId 是否为空选择新会话或已有会话。
     *
     * @param chatCompletionsDTO 问答请求
     * @return SSE 事件流
     */
    @Operation(summary = "AI助手问答（SSE流式）")
    @PostMapping(path = "completions")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = ChatCompletionsEventVO.class)))
    public SseEmitter chatCompletions(@Valid @RequestBody ChatCompletionsDTO chatCompletionsDTO) {
        AiCallContext context = currentContext();
        if (StringUtils.isNotNull(chatCompletionsDTO.getConversationId())) {
            return chatService.authedChatCompletions(chatCompletionsDTO, context);
        }
        return chatService.chatCompletions(chatCompletionsDTO, context);
    }

    /**
     * 无会话流式问答。
     *
     * @param chatCompletionsDTO 问答请求
     * @return SSE 事件流
     */
    @PostMapping(path = "completions/noConversation")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = ChatCompletionsEventVO.class)))
    public SseEmitter chatCompletionsNoConversation(@Valid @RequestBody ChatCompletionsDTO chatCompletionsDTO) {
        return chatService.chatNoConversationCompletions(chatCompletionsDTO, currentContext());
    }

    /**
     * 慕课视频总结。
     *
     * @param moocVideoSummarizeDTO 总结请求
     * @return SSE 事件流
     */
    @PostMapping(path = "moocVideoSummarize")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = ChatCompletionsEventVO.class)))
    public SseEmitter moocVideoSummarize(@Validated @RequestBody MoocVideoSummarizeDTO moocVideoSummarizeDTO) {
        return chatService.moocVideoSummarize(moocVideoSummarizeDTO, currentContext());
    }

    /**
     * 笔记任务提交情况分析。
     *
     * @param noteTaskSubmissionAnalyzeDTO 分析请求
     * @return SSE 事件流
     */
    @PostMapping(path = "noteTaskSubmissionAnalyze")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = ChatCompletionsEventVO.class)))
    public SseEmitter noteTaskSubmissionAnalyze(
            @RequestBody @Validated NoteTaskSubmissionAnalyzeDTO noteTaskSubmissionAnalyzeDTO) {
        return chatService.noteTaskSubmissionAnalyze(noteTaskSubmissionAnalyzeDTO, currentContext());
    }

    private AiCallContext currentContext() {
        return new AiCallContext(tokenUtil.getLoginUser(), accessTokenProvider.getAccessToken());
    }
}
