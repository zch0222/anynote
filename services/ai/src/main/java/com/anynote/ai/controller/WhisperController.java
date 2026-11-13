package com.anynote.ai.controller;

import com.anynote.ai.api.model.dto.WhisperDTO;
import com.anynote.ai.api.model.vo.WhisperSubmitVO;
import com.anynote.ai.model.bo.WhisperTaskQueryParam;
import com.anynote.ai.model.vo.WhisperEventVO;
import com.anynote.ai.model.vo.WhisperTaskStatusVOV1;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.service.WhisperService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.common.security.token.AccessTokenProvider;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
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
import jakarta.validation.constraints.NotNull;

/**
 * Whisper 语音转文字 Controller。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "语音转文字", description = "Whisper语音转文字接口")
@RestController
@RequestMapping("whisper")
@Slf4j
public class WhisperController {

    @Resource
    private WhisperService whisperService;

    @Resource
    private TokenUtil tokenUtil;

    @Resource
    private AccessTokenProvider accessTokenProvider;

    /**
     * 流式转发音频转写结果。
     *
     * @param whisperDTO 转写请求
     * @return SSE 事件流
     */
    @PostMapping(path = "")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = WhisperEventVO.class)))
    public SseEmitter whisper(@Validated @RequestBody WhisperDTO whisperDTO) {
        return whisperService.whisper(whisperDTO, currentContext());
    }

    /**
     * 提交转写任务。
     *
     * @param fromSource 内部调用来源
     * @param whisperDTO 转写请求
     * @return 任务信息
     */
    @InnerAuth
    @PostMapping("submit")
    public ResData<WhisperSubmitVO> submitWhisperTask(@RequestHeader("from-source") String fromSource,
                                                      @Validated @RequestBody WhisperDTO whisperDTO) {
        return ResUtil.success(whisperService.submitWhisper(whisperDTO, currentContext()));
    }

    /**
     * 订阅转写任务状态。
     *
     * @param taskId 任务 id
     * @param accessToken 用户令牌
     * @return SSE 事件流
     */
    @GetMapping("/status/{taskId}")
    @ApiResponse(responseCode = "200", description = "SSE 事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = WhisperTaskStatusVOV1.class)))
    public SseEmitter taskStatus(@PathVariable("taskId") Long taskId,
                                 @Validated @NotNull(message = "Token不能为空")
                                 @RequestHeader("accessToken") String accessToken) {
        return whisperService.whisperTaskStatusV1(WhisperTaskQueryParam.builder()
                .whisperTaskId(taskId)
                .accessToken(accessToken)
                .build());
    }

    private AiCallContext currentContext() {
        return new AiCallContext(tokenUtil.getLoginUser(), accessTokenProvider.getAccessToken());
    }
}
