package com.anynote.ai.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.anynote.ai.model.vo.AgentVisualDispatchVO;
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
         * 历史回答所在运行的依赖清单（实体键），Python 开跑前据此复核可读性。
         */
        @JsonInclude(JsonInclude.Include.NON_EMPTY)
        private List<String> dependencies;

        /**
         * 历史回答实际发送过的页面图像元数据，不含图片字节。
         */
        @JsonInclude(JsonInclude.Include.NON_EMPTY)
        private List<AgentVisualDispatchVO> visualDispatches;

        /**
         * 历史回答在原轮次中的引用编号与标题。
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
