package com.anynote.ai.service.impl;

import com.anynote.ai.api.enums.WhisperTaskStatus;
import com.anynote.ai.api.model.bo.WhisperTaskStatusUpdatedMQParamV1;
import com.anynote.ai.api.model.dto.WhisperDTO;
import com.anynote.ai.api.model.po.WhisperTask;
import com.anynote.ai.api.model.vo.WhisperSubmitVO;
import com.anynote.ai.api.mq.WhisperTaskMQService;
import com.anynote.ai.harness.HarnessClient;
import com.anynote.ai.harness.dto.FastApiWhisperTranscriptionDTO;
import com.anynote.ai.harness.vo.FastApiWhisperTranscriptionVO;
import com.anynote.ai.model.bo.WhisperConfig;
import com.anynote.ai.model.bo.WhisperTaskQueryParam;
import com.anynote.ai.model.vo.WhisperTaskStatusVOV1;
import com.anynote.ai.model.vo.WhisperVO;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.run.SseEventSender;
import com.anynote.ai.service.FfmpegService;
import com.anynote.ai.service.WhisperService;
import com.anynote.ai.service.WhisperTaskService;
import com.anynote.common.redis.constant.RedisChannel;
import com.anynote.common.redis.service.ConfigService;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.constant.SysApiStatisticsType;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.utils.RemoteResDataUtil;
import com.anynote.core.utils.StringUtils;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.model.bo.ObjectURL;
import com.anynote.file.api.model.dto.DownloadObjectDTO;
import com.anynote.system.api.RemoteSysApiStatisticsService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.dto.IncreaseApiUsageDTO;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Whisper 转写与任务状态流服务。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class WhisperServiceImpl implements WhisperService {

    /**
     * Python 侧加载的本地 Whisper 模型名。
     */
    private static final String WHISPER_MODEL = "turbo";

    /**
     * 状态流的最长保持时间。
     */
    private static final long STATUS_STREAM_TIMEOUT_MILLIS = 30 * 60 * 1000L;

    /**
     * 状态流心跳间隔（秒）。
     */
    private static final long HEARTBEAT_SECONDS = 10L;

    private final RestClient whisperRestClient = RestClient.create();

    @Resource
    private ConfigService configService;

    @Resource
    private Gson gson;

    @Resource
    private HarnessClient harnessClient;

    @Resource
    private TokenUtil tokenUtil;

    @Resource
    private WhisperTaskService whisperTaskService;

    @Resource
    private WhisperTaskMQService whisperTaskMQService;

    @Resource
    private RemoteFileService remoteFileService;

    @Resource
    private RemoteSysApiStatisticsService remoteSysApiStatisticsService;

    @Resource
    private FfmpegService ffmpegService;

    @Resource
    private RedisMessageListenerContainer redisMessageListenerContainer;

    @Resource(name = "whisperExecutor")
    private Executor whisperExecutor;

    @Resource(name = "ffmpegExecutor")
    private Executor ffmpegExecutor;

    @Resource(name = "ioExecutor")
    private Executor ioExecutor;

    @Override
    public SseEmitter whisper(WhisperDTO whisperDTO, AiCallContext context) {
        ObjectURL objectURL = RemoteResDataUtil.getResData(
                remoteFileService.getObjectUrlByObjectName(whisperDTO.getObjectName()), "获取音频地址失败");
        SseEmitter emitter = new SseEmitter(STATUS_STREAM_TIMEOUT_MILLIS);
        ioExecutor.execute(() -> relayWhisperTranscription(context, whisperDTO, objectURL.getUrl(), emitter));
        return emitter;
    }

    @Override
    public WhisperSubmitVO submitWhisper(WhisperDTO whisperDTO, AiCallContext context) {
        Date now = new Date();
        WhisperTask whisperTask = WhisperTask.builder()
                .createBy(context.getUserId())
                .updateBy(context.getUserId())
                .createTime(now)
                .updateTime(now)
                .taskStatus(0)
                .build();
        whisperTaskService.getBaseMapper().insert(whisperTask);
        whisperV1(whisperDTO, whisperTask.getId());
        return WhisperSubmitVO.builder().taskId(whisperTask.getId()).build();
    }

    @Override
    public SseEmitter whisperTaskStatusV1(WhisperTaskQueryParam queryParam) {
        LoginUser loginUser = tokenUtil.getLoginUser(queryParam.getAccessToken());
        WhisperTask whisperTask = whisperTaskService.getBaseMapper().selectById(queryParam.getWhisperTaskId());
        if (StringUtils.isNull(whisperTask)) {
            throw new BusinessException("任务不存在");
        }
        if (!loginUser.getUserId().equals(whisperTask.getCreateBy())) {
            throw new AuthException("没有权限访问任务");
        }
        SseEmitter emitter = new SseEmitter(STATUS_STREAM_TIMEOUT_MILLIS);
        ioExecutor.execute(() -> relayWhisperTaskStatus(whisperTask, emitter));
        return emitter;
    }

    @Override
    public void whisperV1(WhisperDTO whisperDTO, Long taskId) {
        WhisperConfig whisperConfig = gson.fromJson(configService.getWhisperConfig(), WhisperConfig.class);
        CompletableFuture.supplyAsync(() -> {
            log.info("whisper object: {}, language: {}, start download",
                    whisperDTO.getObjectName(), whisperDTO.getLanguage());
            return RemoteResDataUtil.getResData(remoteFileService
                    .downloadObject(DownloadObjectDTO.builder()
                            .objectName(whisperDTO.getObjectName())
                            .fileFolder(whisperConfig.getTmpFileFolder())
                            .build(), SecurityConstants.INNER));
        }, whisperExecutor).thenApplyAsync(filePath -> {
            log.info("whisper object: {}, language: {}, start ffmpeg",
                    whisperDTO.getObjectName(), whisperDTO.getLanguage());
            return ffmpegService.copyAudio(filePath);
        }, ffmpegExecutor).thenAcceptAsync(audioPath -> {
            log.info("whisper object: {}, language: {}, start remote whisper",
                    whisperDTO.getObjectName(), whisperDTO.getLanguage());
            String srt = remoteWhisper(audioPath, whisperDTO.getLanguage());
            whisperTaskMQService.sendWhisperTaskStatusUpdateMessage(WhisperTaskStatusUpdatedMQParamV1
                    .builder().status(WhisperTaskStatus.UPLOADING_SRT_OBJECT)
                    .taskId(taskId)
                    .result(WhisperTaskStatusUpdatedMQParamV1.Result.builder()
                            .srt(srt)
                            .build())
                    .build());
        }, whisperExecutor).exceptionally(ex -> {
            log.error("whisper object: {}, language: {}, error",
                    whisperDTO.getObjectName(), whisperDTO.getLanguage(), ex);
            whisperTaskMQService.sendWhisperTaskStatusUpdateMessage(WhisperTaskStatusUpdatedMQParamV1
                    .builder().status(WhisperTaskStatus.FAILED)
                    .taskId(taskId)
                    .errorMessage(ex.getMessage())
                    .build());
            return null;
        });
    }

    /**
     * 记录 whisper 调用次数。
     */
    public void increaseWhisperUsageCount() {
        try {
            Date now = new Date();
            ioExecutor.execute(() -> {
                RemoteResDataUtil.getResData(remoteSysApiStatisticsService.increaseUsage(
                        IncreaseApiUsageDTO.builder()
                                .time(now)
                                .type(SysApiStatisticsType.WHISPER)
                                .build(), SecurityConstants.INNER));
            });
        } catch (Exception e) {
            log.error("记录Whisper调用次数失败", e);
        }
    }

    private void relayWhisperTranscription(AiCallContext context, WhisperDTO whisperDTO, String fileUrl,
                                           SseEmitter emitter) {
        SseEventSender sender = new SseEventSender(emitter);
        try {
            harnessClient.streamTranscription(context, FastApiWhisperTranscriptionDTO.builder()
                    .fileUrl(fileUrl)
                    .model(WHISPER_MODEL)
                    .language(whisperDTO.getLanguage())
                    .build(), transcriptionVO -> sender.send("message", toWhisperVO(transcriptionVO)));
        } catch (Exception e) {
            log.error("音频转写流式转发失败, objectName={}", whisperDTO.getObjectName(), e);
            WhisperVO failedVO = new WhisperVO();
            failedVO.setStatus(WhisperTaskStatus.FAILED.name());
            sender.send("message", failedVO);
        } finally {
            sender.complete();
        }
    }

    private void relayWhisperTaskStatus(WhisperTask whisperTask, SseEmitter emitter) {
        SseEventSender sender = new SseEventSender(emitter);
        LinkedBlockingQueue<String> statusQueue = new LinkedBlockingQueue<>();
        ChannelTopic topic = new ChannelTopic(
                RedisChannel.WHISPER_TASK_STATUS_CHANNEL + whisperTask.getId());
        MessageListener listener = (message, pattern) ->
                statusQueue.offer(new String(message.getBody(), StandardCharsets.UTF_8));
        redisMessageListenerContainer.addMessageListener(listener, topic);
        try {
            sender.send("message", WhisperTaskStatusVOV1.builder()
                    .taskId(whisperTask.getId())
                    .whisperTaskStatus(whisperTask.getTaskStatus())
                    .build());
            while (!sender.isClientGone()) {
                String payload = statusQueue.poll(HEARTBEAT_SECONDS, TimeUnit.SECONDS);
                if (payload == null) {
                    sender.send("heartbeat", null);
                    continue;
                }
                WhisperTaskStatusVOV1 statusVO = gson.fromJson(payload, WhisperTaskStatusVOV1.class);
                if (StringUtils.isNotNull(statusVO)) {
                    sender.send("message", statusVO);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("Whisper 任务状态流转发失败, taskId={}", whisperTask.getId(), e);
        } finally {
            redisMessageListenerContainer.removeMessageListener(listener, topic);
            sender.complete();
        }
    }

    static WhisperVO toWhisperVO(FastApiWhisperTranscriptionVO transcriptionVO) {
        WhisperVO whisperVO = new WhisperVO();
        whisperVO.setStatus(transcriptionVO.getStatus());
        JsonElement result = transcriptionVO.getResult();
        if (result == null || result.isJsonNull()) {
            return whisperVO;
        }
        WhisperVO.Data data = new WhisperVO.Data();
        if (result.isJsonObject()) {
            JsonObject resultObject = result.getAsJsonObject();
            if (resultObject.has("text") && !resultObject.get("text").isJsonNull()) {
                data.setText(resultObject.get("text").getAsString());
            }
            if (resultObject.has("srt") && !resultObject.get("srt").isJsonNull()) {
                data.setSrt(resultObject.get("srt").getAsString());
            }
        } else {
            data.setText(result.getAsString());
        }
        whisperVO.setData(data);
        return whisperVO;
    }

    private String remoteWhisper(String audioPath, String language) {
        increaseWhisperUsageCount();
        WhisperConfig whisperConfig = gson.fromJson(configService.getWhisperConfig(), WhisperConfig.class);
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", new FileSystemResource(audioPath));
        builder.part("language", "zh");
        builder.part("model", "whisper-1");
        builder.part("response_format", "vtt");
        return whisperRestClient.post()
                .uri(whisperConfig.getBaseUrl() + "/audio/transcriptions")
                .header("Authorization", StringUtils.format("Bearer {}", whisperConfig.getApiKey()))
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(builder.build())
                .retrieve()
                .body(String.class);
    }
}
