package com.anynote.ai.harness.vo;

import com.google.gson.JsonElement;
import lombok.Data;

/**
 * Python 音频转写的 SSE 事件数据。
 *
 * @author 称霸幼儿园
 */
@Data
public class FastApiWhisperTranscriptionVO {

    /**
     * 任务标识
     */
    private String id;

    /**
     * 任务状态：DOWNLOADING、RUNNING、HEARTBEAT、DONE、FAILED
     */
    private String status;

    /**
     * 任务结果，DONE 时为含 srt/text 的对象，FAILED 时为错误字符串
     */
    private JsonElement result;
}
