package com.anynote.ai.service;

import com.anynote.ai.api.model.dto.DocQueryDTO;
import com.anynote.ai.model.dto.AgentRunRequestDTO;
import com.anynote.ai.model.vo.AgentRunCancelVO;
import com.anynote.ai.model.vo.AgentRunStatusVO;
import com.anynote.ai.run.AiCallContext;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 知识检索 Agent 运行服务。
 *
 * @author 称霸幼儿园
 */
public interface AgentRunService {

    /**
     * 创建知识检索运行并返回 SSE 事件流。
     *
     * @param request 运行请求
     * @param context 调用身份上下文
     * @return SSE 事件流
     */
    SseEmitter createRun(AgentRunRequestDTO request, AiCallContext context);

    /**
     * 创建限定单个 PDF 资料范围的运行。
     *
     * @param request PDF 问答请求
     * @param context 调用身份上下文
     * @return SSE 事件流
     */
    SseEmitter createDocumentRun(DocQueryDTO request, AiCallContext context);

    /**
     * 取消当前用户拥有的运行。
     *
     * @param runId 运行标识
     * @param context 调用身份上下文
     * @return 取消结果
     */
    AgentRunCancelVO cancelRun(String runId, AiCallContext context);

    /**
     * 查询当前用户拥有的运行状态与结果。
     *
     * @param runId 运行标识
     * @param context 调用身份上下文
     * @return 运行状态与结果
     */
    AgentRunStatusVO getRun(String runId, AiCallContext context);
}
