package com.anynote.ai.service.impl;

import com.anynote.ai.harness.vo.FastApiWhisperTranscriptionVO;
import com.anynote.ai.model.vo.WhisperVO;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link WhisperServiceImpl} 的转写事件映射单元测试。
 *
 * @author 称霸幼儿园
 */
class WhisperServiceImplTest {

    @Test
    @DisplayName("DONE 事件把 srt/text 映射到 data")
    void mapsDoneResult() {
        FastApiWhisperTranscriptionVO source = new FastApiWhisperTranscriptionVO();
        source.setStatus("DONE");
        JsonElement result = new Gson().fromJson("{\"srt\":\"1\\n00:00:00,000 --> 00:00:01,000\\n你好\","
                + "\"text\":\"你好\"}", JsonElement.class);
        source.setResult(result);

        WhisperVO whisperVO = WhisperServiceImpl.toWhisperVO(source);

        assertThat(whisperVO.getStatus()).isEqualTo("DONE");
        assertThat(whisperVO.getData().getText()).isEqualTo("你好");
        assertThat(whisperVO.getData().getSrt()).contains("你好");
    }

    @Test
    @DisplayName("FAILED 字符串结果映射到 data.text")
    void mapsFailedResult() {
        FastApiWhisperTranscriptionVO source = new FastApiWhisperTranscriptionVO();
        source.setStatus("FAILED");
        source.setResult(new Gson().fromJson("\"模型加载失败\"", JsonElement.class));

        WhisperVO whisperVO = WhisperServiceImpl.toWhisperVO(source);

        assertThat(whisperVO.getStatus()).isEqualTo("FAILED");
        assertThat(whisperVO.getData().getText()).isEqualTo("模型加载失败");
    }

    @Test
    @DisplayName("无结果时只返回状态")
    void mapsStatusWithoutResult() {
        FastApiWhisperTranscriptionVO source = new FastApiWhisperTranscriptionVO();
        source.setStatus("RUNNING");

        WhisperVO whisperVO = WhisperServiceImpl.toWhisperVO(source);

        assertThat(whisperVO.getStatus()).isEqualTo("RUNNING");
        assertThat(whisperVO.getData()).isNull();
    }
}
