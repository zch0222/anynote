package com.anynote.ai.controller;

import com.anynote.ai.model.dto.AgentRunRequestDTO;
import com.anynote.ai.model.vo.AgentRunCancelVO;
import com.anynote.ai.model.vo.AgentRunEventVO;
import com.anynote.ai.model.vo.AgentRunStatusVO;
import com.anynote.ai.run.AiCallContext;
import com.anynote.ai.service.AgentRunService;
import com.anynote.common.security.token.AccessTokenProvider;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 知识检索 Agent 运行端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "AI Agent 运行")
@RestController
@RequestMapping("/v1/agent/runs")
public class AgentRunController {

    @Resource
    private AgentRunService agentRunService;

    @Resource
    private TokenUtil tokenUtil;

    @Resource
    private AccessTokenProvider accessTokenProvider;

    /**
     * 创建知识检索运行并返回 SSE 事件流。
     *
     * @param request 运行请求
     * @return SSE 事件流
     */
    @Operation(summary = "创建知识检索 Agent 运行")
    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @ApiResponse(responseCode = "200", description = "Agent 运行事件流",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(implementation = AgentRunEventVO.class)))
    public SseEmitter createRun(@Valid @RequestBody AgentRunRequestDTO request) {
        return agentRunService.createRun(request, currentContext());
    }

    /**
     * 取消当前用户拥有的运行。
     *
     * @param runId 运行标识
     * @return 取消结果
     */
    @Operation(summary = "取消 Agent 运行")
    @PostMapping("/{runId}/cancel")
    public ResData<AgentRunCancelVO> cancelRun(@PathVariable("runId") String runId) {
        return ResData.success(agentRunService.cancelRun(runId, currentContext()));
    }

    /**
     * 查询当前用户拥有的运行状态与最终结果。
     *
     * @param runId 运行标识
     * @return 运行状态与结果
     */
    @Operation(summary = "查询 Agent 运行结果")
    @GetMapping("/{runId}")
    public ResData<AgentRunStatusVO> getRun(@PathVariable("runId") String runId) {
        return ResData.success(agentRunService.getRun(runId, currentContext()));
    }

    private AiCallContext currentContext() {
        return new AiCallContext(tokenUtil.getLoginUser(), accessTokenProvider.getAccessToken());
    }
}
