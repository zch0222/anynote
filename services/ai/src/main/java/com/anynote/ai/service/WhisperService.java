package com.anynote.ai.service;

import com.anynote.ai.api.model.dto.WhisperDTO;
import com.anynote.ai.api.model.vo.WhisperSubmitVO;
import com.anynote.ai.model.bo.WhisperTaskQueryParam;
import com.anynote.ai.model.vo.WhisperTaskStatusVOV1;
import com.anynote.ai.run.AiCallContext;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Whisper 语音转写相关能力。
 *
 * @author 称霸幼儿园
 */
public interface WhisperService {

    /**
     * 流式转发音频转写结果。
     *
     * @param whisperDTO 转写请求
     * @param context 调用身份上下文
     * @return SSE 响应
     */
    SseEmitter whisper(WhisperDTO whisperDTO, AiCallContext context);

    /**
     * 提交转写任务并异步处理。
     *
     * @param whisperDTO 转写请求
     * @param context 调用身份上下文
     * @return 任务信息
     */
    WhisperSubmitVO submitWhisper(WhisperDTO whisperDTO, AiCallContext context);

    /**
     * 订阅转写任务状态，先返回当前状态再推送后续变化。
     *
     * @param queryParam 任务查询参数
     * @return SSE 响应
     */
    SseEmitter whisperTaskStatusV1(WhisperTaskQueryParam queryParam);

    /**
     * 异步执行转写任务。
     *
     * @param whisperDTO 转写请求
     * @param taskId 任务 id
     */
    void whisperV1(WhisperDTO whisperDTO, Long taskId);
}
