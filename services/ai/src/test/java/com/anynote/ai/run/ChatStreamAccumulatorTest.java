package com.anynote.ai.run;

import com.anynote.ai.harness.vo.FastApiChatCompletionsVO;
import com.anynote.ai.api.model.vo.ChatCompletionsVO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link ChatStreamAccumulator} 单元测试：增量拼接与失败帧。
 *
 * @author 称霸幼儿园
 */
class ChatStreamAccumulatorTest {

    @Test
    @DisplayName("成功增量逐条累积并带会话 id")
    void accumulatesSuccessChunks() {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(12L);

        ChatCompletionsVO first = accumulator.onChunk(chunk("你"));
        ChatCompletionsVO second = accumulator.onChunk(chunk("好"));

        assertThat(first.getStatus()).isEqualTo("success");
        assertThat(first.getMessage()).isEqualTo("你");
        assertThat(first.getConversationId()).isEqualTo(12L);
        assertThat(second.getMessage()).isEqualTo("好");
        assertThat(accumulator.getContent()).isEqualTo("你好");
    }

    @Test
    @DisplayName("空增量与空 choices 不抛异常")
    void handlesEmptyChunks() {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(1L);

        assertThat(accumulator.onChunk(null).getMessage()).isEmpty();
        assertThat(accumulator.onChunk(new FastApiChatCompletionsVO()).getMessage()).isEmpty();
        assertThat(accumulator.getContent()).isEmpty();
    }

    @Test
    @DisplayName("失败帧返回约定文案并把提示追加到落库正文")
    void buildsFailureFrame() {
        ChatStreamAccumulator accumulator = new ChatStreamAccumulator(3L);
        accumulator.onChunk(chunk("部分回答"));

        ChatCompletionsVO failed = accumulator.onFailure();

        assertThat(failed.getStatus()).isEqualTo("failed");
        assertThat(failed.getMessage()).isEqualTo(ChatStreamAccumulator.FAILED_MESSAGE);
        assertThat(accumulator.getContent()).isEqualTo("部分回答\n" + ChatStreamAccumulator.FAILED_MESSAGE);
    }

    private FastApiChatCompletionsVO chunk(String content) {
        FastApiChatCompletionsVO.Choice.Delta delta = new FastApiChatCompletionsVO.Choice.Delta();
        delta.setContent(content);
        FastApiChatCompletionsVO.Choice choice = new FastApiChatCompletionsVO.Choice();
        choice.setIndex(0L);
        choice.setDelta(delta);
        FastApiChatCompletionsVO chunk = new FastApiChatCompletionsVO();
        chunk.setChoices(List.of(choice));
        return chunk;
    }
}
