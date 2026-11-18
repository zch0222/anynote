package com.anynote.ai.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Java 向 Python Harness 发送的运行请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HarnessRunRequestDTO {

    private String runId;

    private String input;

    private String agent;

    private Long conversationId;

    private List<Message> history;

    private AgentRunScopeDTO scope;

    private String model;

    /**
     * Harness 会话历史消息。
     *
     * @author 称霸幼儿园
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Message {

        private String role;

        private String content;

        private List<Citation> citations;

        /**
         * 历史回答在原轮次中的引用。
         *
         * @author 称霸幼儿园
         */
        @Data
        @Builder
        @NoArgsConstructor
        @AllArgsConstructor
        public static class Citation {

            private Integer index;

            private String title;
        }
    }
}
