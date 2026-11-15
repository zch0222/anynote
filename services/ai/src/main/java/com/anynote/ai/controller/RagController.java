package com.anynote.ai.controller;

import com.anynote.ai.api.model.dto.DocQueryDTO;
import com.anynote.ai.model.vo.AgentRunEventVO;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.service.AgentRunService;
import com.anynote.common.security.token.AccessTokenProvider;
import com.anynote.common.security.token.TokenUtil;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.annotation.Resource;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * RAG 检索 Controller。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "RAG检索", description = "知识库RAG检索接口")
@RestController
@RequestMapping("/rag")
public class RagController {

    @Resource
    private AgentRunService agentRunService;

    @Resource
    private TokenUtil tokenUtil;

    @Resource
    private AccessTokenProvider accessTokenProvider;

    /**
     * 文档问答入口，M16.6 恢复为范围限定到单个资料的运行。
     *
     * @param docQueryDTO 文档问答请求
     * @return Agent 运行事件流
     */
    @Operation(summary = "PDF 单资料范围问答")
    @PostMapping(path = "query/docs/v1", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @ApiResponse(responseCode = "200", description = "Agent 运行事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = AgentRunEventVO.class)))
    public SseEmitter queryDocV1(@Validated @RequestBody DocQueryDTO docQueryDTO) {
        return agentRunService.createDocumentRun(docQueryDTO, currentContext());
    }

    private AiCallContext currentContext() {
        return new AiCallContext(tokenUtil.getLoginUser(), accessTokenProvider.getAccessToken());
    }
}
