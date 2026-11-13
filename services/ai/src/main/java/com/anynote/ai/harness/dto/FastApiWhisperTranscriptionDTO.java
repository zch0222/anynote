package com.anynote.ai.harness.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Python 音频转写请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FastApiWhisperTranscriptionDTO {

    /**
     * 音频文件的可下载地址
     */
    @JsonProperty("file_url")
    private String fileUrl;

    /**
     * Python 侧加载的 Whisper 模型名
     */
    private String model;

    /**
     * 音频语言
     */
    private String language;
}
