package com.anynote.ai.controller;

import com.anynote.ai.mapper.AgentRunEventMapper;
import com.anynote.ai.mapper.AgentRunMapper;
import com.anynote.ai.mapper.AgentTraceAccessMapper;
import com.anynote.ai.mapper.ChatMessageMapper;
import com.anynote.ai.model.po.AgentRunEventPO;
import com.anynote.ai.model.po.AgentRunPO;
import com.anynote.ai.model.vo.AgentRunAdminDetailVO;
import com.anynote.ai.model.vo.AgentRunAdminEventVO;
import com.anynote.ai.model.vo.AgentRunAdminStatsVO;
import com.anynote.ai.model.vo.AgentRunAdminVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.AgentRunAdminService;
import com.anynote.ai.service.impl.AgentRunAdminServiceImpl;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.system.api.model.bo.LoginUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 管理端运行轨迹端点单测：管理员鉴权、参数与留痕传递。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class AgentRunAdminControllerTest {

    @Mock
    private AgentRunAdminService agentRunAdminService;

    @Mock
    private SystemAdminGuard systemAdminGuard;

    @Mock
    private LoginUser loginUser;

    private MockMvc mockMvc;

    private AgentRunAdminController agentRunAdminControllerInstance() {
        return new AgentRunAdminController(agentRunAdminService, systemAdminGuard);
    }

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new AgentRunAdminController(agentRunAdminService, systemAdminGuard))
                .build();
    }

    /**
     * 验证列表端点先做管理员校验并传递筛选参数。
     */
    @Test
    @DisplayName("列表端点校验管理员并传递筛选")
    void listRunsRequiresAdminAndPassesFilters() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        PageBean<AgentRunAdminVO> page = new PageBean<>();
        page.setRows(List.of(AgentRunAdminVO.builder().runId("run-abc").build()));
        when(agentRunAdminService.listRuns(2, 10, 9L, "run-abc", "ANSWERED", null, null)).thenReturn(page);

        mockMvc.perform(get("/v1/admin/agent-runs")
                        .param("pageNum", "2")
                        .param("pageSize", "10")
                        .param("userId", "9")
                        .param("runId", "run-abc")
                        .param("outcome", "ANSWERED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rows[0].runId").value("run-abc"));

        verify(systemAdminGuard).requireAdmin();
    }

    /**
     * 验证统计端点先做管理员校验并传递时间范围与粒度。
     */
    @Test
    @DisplayName("统计端点校验管理员并传递筛选")
    void statsRequiresAdminAndPassesFilters() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(agentRunAdminService.getStats("from", "to", "DAY"))
                .thenReturn(AgentRunAdminStatsVO.builder().totalRuns(6L).build());

        mockMvc.perform(get("/v1/admin/agent-runs/stats")
                        .param("startedFrom", "from")
                        .param("startedTo", "to")
                        .param("granularity", "DAY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRuns").value(6));

        verify(systemAdminGuard).requireAdmin();
        verify(agentRunAdminService).getStats("from", "to", "DAY");
    }

    /**
     * 验证统计端点鉴权失败时不访问服务。
     */
    @Test
    @DisplayName("统计端点鉴权失败时不访问服务")
    void statsRejectsWhenNotAdmin() {
        org.mockito.Mockito.doThrow(new com.anynote.core.exception.auth.AuthException(
                com.anynote.core.web.enums.ResCode.UNAUTHORIZED_ERROR))
                .when(systemAdminGuard).requireAdmin();

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> agentRunAdminControllerInstance().getStats(null, null, null))
                .isInstanceOf(com.anynote.core.exception.auth.AuthException.class);

        verify(agentRunAdminService, never()).getStats(any(), any(), any());
    }

    /**
     * 验证详情端点传递运行标识与管理员 id（留痕）。
     */
    @Test
    @DisplayName("详情端点传递运行标识与管理员 id")
    void getRunPassesAdminIdForAccessLog() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(42L);
        when(agentRunAdminService.getRun("run-1", 42L)).thenReturn(AgentRunAdminDetailVO.builder().build());

        mockMvc.perform(get("/v1/admin/agent-runs/run-1"))
                .andExpect(status().isOk());

        verify(agentRunAdminService).getRun("run-1", 42L);
    }

    /**
     * 验证事件端点限制单页上限并写留痕。
     */
    @Test
    @DisplayName("事件端点收紧 limit 并传递游标")
    void listEventsBindsLimitAndCursor() throws Exception {
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(42L);
        when(agentRunAdminService.listEvents(eq("run-1"), eq(100L), eq(999), eq(42L)))
                .thenReturn(List.of(AgentRunAdminEventVO.builder().seq(101L).build()));

        mockMvc.perform(get("/v1/admin/agent-runs/run-1/events")
                        .param("afterSeq", "100")
                        .param("limit", "999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].seq").value(101));

        verify(agentRunAdminService).listEvents("run-1", 100L, 999, 42L);
    }

    /**
     * 经真实 Jackson 转换器输出完整 Trace：content 是 JSON 对象，可按路径取到内部字段，纳秒时间戳不丢精度。
     */
    @Test
    @DisplayName("事件接口经真实 Jackson 转换器输出 JSON 对象")
    void eventsSerializeJsonContentThroughJackson() throws Exception {
        AgentRunMapper runMapper = org.mockito.Mockito.mock(AgentRunMapper.class);
        AgentRunEventMapper eventMapper = org.mockito.Mockito.mock(AgentRunEventMapper.class);
        long endTimeNano = 1_800_000_000_000_000_001L;
        when(runMapper.selectOne(any())).thenReturn(AgentRunPO.builder().runId("run-1").build());
        when(eventMapper.selectRunEvents("run-1", 0L, 100)).thenReturn(List.of(AgentRunEventPO.builder()
                .runId("run-1").seq(1L).type("trace.model")
                .content("{\"name\":\"model.call\",\"endTimeUnixNano\":" + endTimeNano
                        + ",\"attributes\":{\"turn\":1}}")
                .build()));
        AgentRunAdminService realService = new AgentRunAdminServiceImpl(runMapper, eventMapper,
                org.mockito.Mockito.mock(AgentTraceAccessMapper.class),
                org.mockito.Mockito.mock(ChatMessageMapper.class), new Gson(), new ObjectMapper());
        when(systemAdminGuard.requireAdmin()).thenReturn(loginUser);
        when(loginUser.getUserId()).thenReturn(42L);
        MockMvc realMvc = MockMvcBuilders.standaloneSetup(new AgentRunAdminController(realService, systemAdminGuard))
                .build();

        realMvc.perform(get("/v1/admin/agent-runs/run-1/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].content.name").value("model.call"))
                .andExpect(jsonPath("$.data[0].content.attributes.turn").value(1))
                .andExpect(jsonPath("$.data[0].content.endTimeUnixNano").value(endTimeNano));
    }

    /**
     * 验证非管理员被鉴权组件拒绝后不再访问服务。
     */
    @Test
    @DisplayName("鉴权失败时不访问服务")
    void rejectsWhenNotAdmin() throws Exception {
        org.mockito.Mockito.doThrow(new com.anynote.core.exception.auth.AuthException(
                com.anynote.core.web.enums.ResCode.UNAUTHORIZED_ERROR))
                .when(systemAdminGuard).requireAdmin();

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> agentRunAdminControllerInstance().getRun("run-1"))
                .isInstanceOf(com.anynote.core.exception.auth.AuthException.class);

        verify(agentRunAdminService, never()).getRun(any(), any());
    }
}
