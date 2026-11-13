package com.anynote.ai.service.impl;

import com.anynote.ai.api.enums.ChatCompletionsVOStatus;
import com.anynote.ai.api.enums.ChatConversationType;
import com.anynote.ai.api.enums.ChatRole;
import com.anynote.ai.api.model.bo.ChatConversationDeleteParam;
import com.anynote.ai.api.model.bo.ChatConversationQueryParam;
import com.anynote.ai.api.model.bo.ChatConversationUpdateParam;
import com.anynote.ai.api.model.dto.ChatCompletionsDTO;
import com.anynote.ai.api.model.dto.ChatConversationListDTO;
import com.anynote.ai.api.model.po.ChatConversation;
import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.api.model.po.MoocVideoSummarizePO;
import com.anynote.ai.api.model.vo.ChatCompletionsVO;
import com.anynote.ai.harness.HarnessClient;
import com.anynote.ai.harness.dto.FastApiChatCompletionsDTO;
import com.anynote.ai.model.bo.NoteTaskSubmissionAnalyzeBO;
import com.anynote.ai.model.dto.MoocVideoSummarizeDTO;
import com.anynote.ai.model.dto.NoteTaskSubmissionAnalyzeDTO;
import com.anynote.ai.model.vo.ChatConversationInfoVO;
import com.anynote.ai.model.vo.ChatConversationVO;
import com.anynote.ai.properties.AiHarnessProperties;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.run.AiRunLimiter;
import com.anynote.ai.run.ChatStreamAccumulator;
import com.anynote.ai.run.SseEventSender;
import com.anynote.ai.service.ChatConversationService;
import com.anynote.ai.service.ChatMessageService;
import com.anynote.ai.service.ChatService;
import com.anynote.ai.service.MoocVideoSummarizeService;
import com.anynote.common.datascope.annotation.RequiresPermissions;
import com.anynote.core.constant.Constants;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.constant.SysApiStatisticsType;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.DateUtils;
import com.anynote.core.utils.RemoteResDataUtil;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.note.api.RemoteMoocService;
import com.anynote.note.api.RemoteNoteTaskService;
import com.anynote.note.api.model.vo.AdminNoteTaskVO;
import com.anynote.note.api.model.vo.MoocVideoItemInfoVO;
import com.anynote.note.api.model.vo.NoteTaskChartsVO;
import com.anynote.system.api.RemoteSysApiStatisticsService;
import com.anynote.system.api.model.dto.IncreaseApiUsageDTO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.Resource;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * AI 对话服务：同步处理会话与消息，流式转发在虚拟线程上执行。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class ChatServiceImpl implements ChatService {

    @Resource
    private ChatConversationService chatConversationService;

    @Resource
    private ChatMessageService chatMessageService;

    @Resource
    private MoocVideoSummarizeService moocVideoSummarizeService;

    @Resource
    private TransactionTemplate transactionTemplate;

    @Resource
    private HarnessClient harnessClient;

    @Resource
    private Gson gson;

    @Resource
    private RemoteMoocService remoteMoocService;

    @Resource
    private RemoteFileService remoteFileService;

    @Resource
    private RemoteNoteTaskService remoteNoteTaskService;

    @Resource
    private RemoteSysApiStatisticsService remoteSysApiStatisticsService;

    @Resource
    private AiRunLimiter aiRunLimiter;

    @Resource
    private AiHarnessProperties aiHarnessProperties;

    @Resource(name = "ioExecutor")
    private Executor ioExecutor;

    @Override
    public SseEmitter chatCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context) {
        return startChatStream(chatCompletionsDTO, context, chatCompletionsDTO.getConversationId() == null);
    }

    @Override
    @RequiresPermissions(value = "a:chatConversation:completions", paramIdName = "conversationId",
            queryParamName = "chatCompletionsDTO", requestType = 1)
    public SseEmitter authedChatCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context) {
        return startChatStream(chatCompletionsDTO, context, false);
    }

    @Override
    public SseEmitter chatNoConversationCompletions(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context) {
        if (!aiRunLimiter.tryAcquire(context.getUserId())) {
            return concurrencyLimitedEmitter(chatCompletionsDTO.getConversationId());
        }
        SseEmitter emitter = newSseEmitter();
        try {
            ioExecutor.execute(() -> relayNoConversation(context, chatCompletionsDTO, emitter));
        } catch (RuntimeException e) {
            aiRunLimiter.release(context.getUserId());
            throw e;
        }
        return emitter;
    }

    @Override
    public SseEmitter moocVideoSummarize(MoocVideoSummarizeDTO moocVideoSummarizeDTO, AiCallContext context) {
        if (!aiRunLimiter.tryAcquire(context.getUserId())) {
            return concurrencyLimitedEmitter(null);
        }
        SseEmitter emitter = newSseEmitter();
        try {
            ioExecutor.execute(() -> relayMoocSummarize(context, moocVideoSummarizeDTO, emitter));
        } catch (RuntimeException e) {
            aiRunLimiter.release(context.getUserId());
            throw e;
        }
        return emitter;
    }

    @Override
    public SseEmitter noteTaskSubmissionAnalyze(NoteTaskSubmissionAnalyzeDTO noteTaskSubmissionAnalyzeDTO,
                                               AiCallContext context) {
        if (!aiRunLimiter.tryAcquire(context.getUserId())) {
            return concurrencyLimitedEmitter(null);
        }
        SseEmitter emitter = newSseEmitter();
        try {
            ioExecutor.execute(() -> relayNoteTaskAnalyze(context, noteTaskSubmissionAnalyzeDTO, emitter));
        } catch (RuntimeException e) {
            aiRunLimiter.release(context.getUserId());
            throw e;
        }
        return emitter;
    }

    @Override
    @RequiresPermissions(value = "a:chatConversation:read", paramIdName = "conversationId")
    public ChatConversationVO getChatConversationById(ChatConversationQueryParam queryParam) {
        return loadConversationVO(queryParam.getConversationId());
    }

    @Override
    public PageBean<ChatConversationInfoVO> getChatConversationList(ChatConversationListDTO chatConversationListDTO,
                                                                    AiCallContext context) {
        PageHelper.startPage(chatConversationListDTO.getPage(), chatConversationListDTO.getPageSize(),
                "update_time DESC");
        List<ChatConversation> chatConversationList = chatConversationService.getBaseMapper()
                .selectList(new LambdaQueryWrapper<ChatConversation>()
                        .eq(StringUtils.isNotNull(chatConversationListDTO.getDocId()), ChatConversation::getDocId,
                                chatConversationListDTO.getDocId())
                        .eq(ChatConversation::getCreateBy, context.getUserId()));
        List<ChatConversationInfoVO> chatConversationInfoVOList = chatConversationList.stream()
                .map(conversation -> ChatConversationInfoVO.builder()
                        .id(conversation.getId())
                        .title(conversation.getTitle())
                        .type(conversation.getType())
                        .docId(conversation.getDocId())
                        .createBy(conversation.getCreateBy())
                        .createTime(conversation.getCreateTime())
                        .updateBy(conversation.getUpdateBy())
                        .updateTime(conversation.getUpdateTime())
                        .build())
                .collect(Collectors.toList());
        PageInfo<ChatConversation> pageInfo = new PageInfo<>(chatConversationList);
        return PageBean.<ChatConversationInfoVO>builder()
                .current(chatConversationListDTO.getPage())
                .pages(pageInfo.getPages())
                .rows(chatConversationInfoVOList)
                .total(pageInfo.getTotal())
                .build();
    }

    @Override
    @RequiresPermissions(value = "a:chatConversation:update", paramIdName = "conversationId",
            queryParamName = "updateParam")
    public String updateChatConversation(ChatConversationUpdateParam updateParam, AiCallContext context) {
        ChatConversation conversation = ChatConversation.builder()
                .id(updateParam.getConversationId())
                .title(updateParam.getTitle())
                .updateTime(new Date())
                .updateBy(context.getUserId())
                .build();
        chatConversationService.updateById(conversation);
        return Constants.SUCCESS_RES;
    }

    @Override
    @RequiresPermissions(value = "a:chatConversation:manage", queryParamName = "chatConversationDeleteParam",
            paramIdName = "conversationId")
    public boolean deleteChatConversationById(ChatConversationDeleteParam chatConversationDeleteParam) {
        return chatConversationService.removeById(chatConversationDeleteParam.getConversationId());
    }

    private SseEmitter startChatStream(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context,
                                       boolean createConversation) {
        if (!aiRunLimiter.tryAcquire(context.getUserId())) {
            return concurrencyLimitedEmitter(chatCompletionsDTO.getConversationId());
        }
        SseEmitter emitter = newSseEmitter();
        ChatOpenResult openResult;
        try {
            openResult = openChat(chatCompletionsDTO, context, createConversation);
        } catch (RuntimeException e) {
            aiRunLimiter.release(context.getUserId());
            throw e;
        }
        try {
            ioExecutor.execute(() -> relayChat(context, openResult, chatCompletionsDTO.getModel(), emitter));
        } catch (RuntimeException e) {
            aiRunLimiter.release(context.getUserId());
            throw e;
        }
        return emitter;
    }

    private ChatOpenResult openChat(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context,
                                    boolean createConversation) {
        return transactionTemplate.execute(status -> {
            ChatConversationVO conversationVO;
            if (createConversation) {
                conversationVO = createConversation(chatCompletionsDTO, context);
            } else {
                conversationVO = loadConversationVO(chatCompletionsDTO.getConversationId());
            }
            ChatMessage askMessage = saveAskMessage(conversationVO, chatCompletionsDTO.getPrompt(), context.getUserId());
            ChatMessage answerMessage = ChatMessage.builder()
                    .content("")
                    .orderIndex(askMessage.getOrderIndex() + 1)
                    .conversationId(chatCompletionsDTO.getConversationId())
                    .role(ChatRole.ASSISTANT.getValue())
                    .type(ChatConversationType.CHAT.getValue())
                    .docId(0L)
                    .deleted(0)
                    .createBy(context.getUserId())
                    .createTime(new Date())
                    .updateBy(context.getUserId())
                    .updateTime(new Date())
                    .build();
            return new ChatOpenResult(conversationVO, answerMessage);
        });
    }

    private ChatConversationVO createConversation(ChatCompletionsDTO chatCompletionsDTO, AiCallContext context) {
        Date now = new Date();
        String prompt = chatCompletionsDTO.getPrompt();
        ChatConversation conversation = ChatConversation.builder()
                .title(prompt.substring(0, Math.min(prompt.length(), 10)))
                .type(ChatConversationType.CHAT.getValue())
                .permissions("70000")
                .docId(0L)
                .deleted(0)
                .updateBy(context.getUserId())
                .createBy(context.getUserId())
                .createTime(now)
                .updateTime(now)
                .build();
        chatConversationService.getBaseMapper().insert(conversation);
        chatCompletionsDTO.setConversationId(conversation.getId());
        return ChatConversationVO.builder()
                .conversation(ChatConversationInfoVO.builder()
                        .id(conversation.getId())
                        .title(conversation.getTitle())
                        .type(conversation.getType())
                        .docId(conversation.getDocId())
                        .permission(7)
                        .createBy(conversation.getCreateBy())
                        .createTime(conversation.getCreateTime())
                        .updateBy(conversation.getUpdateBy())
                        .updateTime(conversation.getUpdateTime())
                        .build())
                .messages(new ArrayList<>())
                .build();
    }

    private ChatConversationVO loadConversationVO(Long conversationId) {
        ChatConversation conversation = chatConversationService.getById(conversationId);
        if (StringUtils.isNull(conversation)) {
            throw new BusinessException(ResCode.BUSINESS_ERROR);
        }
        List<ChatMessage> chatMessageList = chatMessageService.list(new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getConversationId, conversationId)
                .orderByAsc(ChatMessage::getOrderIndex));
        return ChatConversationVO.builder()
                .conversation(ChatConversationInfoVO.builder()
                        .id(conversation.getId())
                        .title(conversation.getTitle())
                        .type(conversation.getType())
                        .docId(conversation.getDocId())
                        .createBy(conversation.getCreateBy())
                        .createTime(conversation.getCreateTime())
                        .updateBy(conversation.getUpdateBy())
                        .updateTime(conversation.getUpdateTime())
                        .build())
                .messages(chatMessageList)
                .build();
    }

    private ChatMessage saveAskMessage(ChatConversationVO chatConversationVO, String prompt, Long userId) {
        Date now = new Date();
        List<ChatMessage> chatMessageList = chatConversationVO.getMessages();
        ChatMessage askMessage = ChatMessage.builder()
                .content(prompt)
                .conversationId(chatConversationVO.getConversation().getId())
                .role(ChatRole.USER.getValue())
                .type(ChatConversationType.CHAT.getValue())
                .docId(0L)
                .deleted(0)
                .createBy(userId)
                .createTime(now)
                .updateBy(userId)
                .updateTime(now)
                .build();
        if (chatMessageList.isEmpty()) {
            askMessage.setOrderIndex(0);
        } else {
            askMessage.setOrderIndex(chatMessageList.get(chatMessageList.size() - 1).getOrderIndex() + 1);
        }
        chatMessageService.getBaseMapper().insert(askMessage);
        chatMessageList.add(askMessage);
        return askMessage;
    }

    private void relayChat(AiCallContext context, ChatOpenResult openResult, String model, SseEmitter emitter) {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(
                openResult.conversation().getConversation().getId());
        SseEventSender sender = new SseEventSender(emitter);
        try {
            recordLlmUsage();
            harnessClient.streamChat(context, buildChatRequest(openResult.conversation(), model), chunk ->
                    sender.send("message", ResData.success(accumulator.onChunk(chunk))));
        } catch (Exception e) {
            log.error("AI 对话流式转发失败, conversationId={}",
                    openResult.conversation().getConversation().getId(), e);
            sender.send("message", ResData.success(accumulator.onFailure()));
        } finally {
            persistAnswerMessage(openResult.answerMessage(), accumulator.getContent());
            sender.complete();
            aiRunLimiter.release(context.getUserId());
        }
    }

    private void relayNoConversation(AiCallContext context, ChatCompletionsDTO chatCompletionsDTO,
                                     SseEmitter emitter) {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(chatCompletionsDTO.getConversationId());
        SseEventSender sender = new SseEventSender(emitter);
        try {
            recordLlmUsage();
            harnessClient.streamChat(context, buildNoConversationRequest(chatCompletionsDTO), chunk ->
                    sender.send("message", ResData.success(accumulator.onChunk(chunk))));
        } catch (Exception e) {
            log.error("无会话 AI 对话流式转发失败", e);
            sender.send("message", ResData.success(accumulator.onFailure()));
        } finally {
            sender.complete();
            aiRunLimiter.release(context.getUserId());
        }
    }

    private void relayMoocSummarize(AiCallContext context, MoocVideoSummarizeDTO moocVideoSummarizeDTO,
                                    SseEmitter emitter) {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(null);
        SseEventSender sender = new SseEventSender(emitter);
        try {
            recordLlmUsage();
            MoocVideoItemInfoVO moocVideoItemInfoVO = RemoteResDataUtil.getResData(remoteMoocService
                            .getMoocVideoItemInfo(moocVideoSummarizeDTO.getMoocItemId(),
                                    moocVideoSummarizeDTO.getMoocId(), SecurityConstants.INNER,
                                    context.getAccessToken()),
                    "获取慕课视频信息失败");
            String srtText = RemoteResDataUtil.getResData(remoteFileService
                    .readTextFile(moocVideoItemInfoVO.getSrtObjectName(), SecurityConstants.INNER), "读取视频字幕失败");
            String prompt = StringUtils.format("根据以下视频字幕的内容，总结视频讲述的主要内容：\n{}", srtText);
            harnessClient.streamChat(context, buildPromptRequest(prompt, moocVideoSummarizeDTO.getModel()), chunk ->
                    sender.send("message", ResData.success(accumulator.onChunk(chunk))));
        } catch (Exception e) {
            log.error("慕课视频总结失败, moocItemId={}", moocVideoSummarizeDTO.getMoocItemId(), e);
            sender.send("message", ResData.success(buildFailedFrame(null)));
        } finally {
            persistMoocSummarize(context, moocVideoSummarizeDTO, accumulator.getContent());
            sender.complete();
            aiRunLimiter.release(context.getUserId());
        }
    }

    private void relayNoteTaskAnalyze(AiCallContext context,
                                      NoteTaskSubmissionAnalyzeDTO noteTaskSubmissionAnalyzeDTO,
                                      SseEmitter emitter) {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(null);
        SseEventSender sender = new SseEventSender(emitter);
        try {
            recordLlmUsage();
            List<NoteTaskChartsVO> noteTaskChartsVOList = RemoteResDataUtil.getResData(remoteNoteTaskService
                            .getNoteTaskChartsData(noteTaskSubmissionAnalyzeDTO.getNoteTaskId(), SecurityConstants.INNER,
                                    context.getAccessToken()),
                    "获取任务提交统计失败");
            AdminNoteTaskVO adminNoteTaskVO = RemoteResDataUtil.getResData(remoteNoteTaskService
                            .getAdminNoteTaskById(noteTaskSubmissionAnalyzeDTO.getNoteTaskId(), SecurityConstants.INNER,
                                    context.getAccessToken()),
                    "获取任务信息失败");
            NoteTaskSubmissionAnalyzeBO analyzeBO = NoteTaskSubmissionAnalyzeBO.builder()
                    .noteTaskChartsVOList(noteTaskChartsVOList)
                    .adminNoteTaskVO(adminNoteTaskVO)
                    .build();
            String prompt = StringUtils.format("以下是一份学生学习笔记任务提交统计，任务开始时间是{}，任务结束时间是{}。\n" +
                            "应该提交的数量是：{}，实际提交的数量是：{}" +
                            "chartsPOList表示的是在startTime到endTime之间提交的用户，editCount表示笔记编辑的次数，评价标准为提交时间和编辑次数。\n" +
                            "请你评价一下这次任务的总体质量。\n{}",
                    adminNoteTaskVO.getStartTime(), adminNoteTaskVO.getEndTime(),
                    adminNoteTaskVO.getNeedSubmitCount(), adminNoteTaskVO.getSubmittedCount(),
                    gson.toJson(analyzeBO.getNoteTaskChartsVOList()));
            harnessClient.streamChat(context, buildPromptRequest(prompt, noteTaskSubmissionAnalyzeDTO.getModel()), chunk ->
                    sender.send("message", ResData.success(accumulator.onChunk(chunk))));
        } catch (Exception e) {
            log.error("笔记任务提交情况分析失败, noteTaskId={}", noteTaskSubmissionAnalyzeDTO.getNoteTaskId(), e);
            sender.send("message", ResData.success(buildFailedFrame(null)));
        } finally {
            log.info("笔记任务提交情况分析结果: {}", accumulator.getContent());
            sender.complete();
            aiRunLimiter.release(context.getUserId());
        }
    }

    private FastApiChatCompletionsDTO buildChatRequest(ChatConversationVO chatConversationVO, String model) {
        List<FastApiChatCompletionsDTO.Message> messages = chatConversationVO.getMessages().stream()
                .map(chatMessage -> FastApiChatCompletionsDTO.Message.builder()
                        .role(ChatRole.parse(chatMessage.getRole()).name().toLowerCase())
                        .content(chatMessage.getContent())
                        .build())
                .collect(Collectors.toList());
        return FastApiChatCompletionsDTO.builder()
                .messages(messages)
                .model(model)
                .build();
    }

    private FastApiChatCompletionsDTO buildNoConversationRequest(ChatCompletionsDTO chatCompletionsDTO) {
        List<FastApiChatCompletionsDTO.Message> messageList = new ArrayList<>(1);
        messageList.add(FastApiChatCompletionsDTO.Message.builder()
                .role("user")
                .content(chatCompletionsDTO.getPrompt())
                .build());
        return FastApiChatCompletionsDTO.builder()
                .model(chatCompletionsDTO.getModel())
                .messages(messageList)
                .build();
    }

    private FastApiChatCompletionsDTO buildPromptRequest(String prompt, String model) {
        List<FastApiChatCompletionsDTO.Message> messageList = new ArrayList<>(1);
        messageList.add(FastApiChatCompletionsDTO.Message.builder()
                .role("user")
                .content(prompt)
                .build());
        return FastApiChatCompletionsDTO.builder()
                .model(model)
                .messages(messageList)
                .build();
    }

    private void persistAnswerMessage(ChatMessage answerMessage, String content) {
        answerMessage.setContent(content);
        aiRunLimiter.acquireDb();
        try {
            transactionTemplate.executeWithoutResult(status -> chatMessageService.getBaseMapper().insert(answerMessage));
        } catch (Exception e) {
            log.error("保存 AI 回答失败, conversationId={}", answerMessage.getConversationId(), e);
        } finally {
            aiRunLimiter.releaseDb();
        }
    }

    private void persistMoocSummarize(AiCallContext context, MoocVideoSummarizeDTO moocVideoSummarizeDTO,
                                      String content) {
        aiRunLimiter.acquireDb();
        try {
            Date now = new Date();
            moocVideoSummarizeService.getBaseMapper().insert(MoocVideoSummarizePO.builder()
                    .moocId(moocVideoSummarizeDTO.getMoocId())
                    .moocItemId(moocVideoSummarizeDTO.getMoocItemId())
                    .content(content)
                    .model(moocVideoSummarizeDTO.getModel())
                    .deleted(0)
                    .updateTime(now)
                    .createTime(now)
                    .updateBy(context.getUserId())
                    .createBy(context.getUserId())
                    .build());
        } catch (Exception e) {
            log.error("保存慕课视频总结失败, moocItemId={}", moocVideoSummarizeDTO.getMoocItemId(), e);
        } finally {
            aiRunLimiter.releaseDb();
        }
    }

    private void recordLlmUsage() {
        Date now = new Date();
        try {
            ioExecutor.execute(() -> {
                try {
                    RemoteResDataUtil.getResData(remoteSysApiStatisticsService.increaseUsage(
                            IncreaseApiUsageDTO.builder()
                                    .time(now)
                                    .type(SysApiStatisticsType.LLM)
                                    .build(), SecurityConstants.INNER));
                } catch (Exception e) {
                    log.error("记录LLM调用次数失败", e);
                }
            });
        } catch (Exception e) {
            log.error("记录LLM调用次数失败", e);
        }
    }

    private ChatCompletionsVO buildFailedFrame(Long conversationId) {
        return ChatCompletionsVO.builder()
                .status(ChatCompletionsVOStatus.FAILED.name().toLowerCase())
                .message(ChatStreamAccumulator.FAILED_MESSAGE)
                .conversationId(conversationId)
                .build();
    }

    SseEmitter newSseEmitter() {
        return new SseEmitter(aiHarnessProperties.getTotalTimeout().toMillis() + 30_000L);
    }

    private SseEmitter concurrencyLimitedEmitter(Long conversationId) {
        SseEmitter emitter = newSseEmitter();
        SseEventSender sender = new SseEventSender(emitter);
        sender.send("message", ResData.success(ChatCompletionsVO.builder()
                .status(ChatCompletionsVOStatus.FAILED.name().toLowerCase())
                .message("当前使用人数较多，请稍后再试")
                .conversationId(conversationId)
                .build()));
        sender.complete();
        return emitter;
    }

    private record ChatOpenResult(ChatConversationVO conversation, ChatMessage answerMessage) {
    }
}
