package com.anynote.note.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.common.security.handler.GlobalExceptionHandler;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.note.model.vo.KnowledgeAuthorizationItemVO;
import com.anynote.note.model.vo.KnowledgeAuthorizationVO;
import com.anynote.note.model.vo.KnowledgeChangePageVO;
import com.anynote.note.model.vo.KnowledgeContentVO;
import com.anynote.note.model.vo.KnowledgeDocumentBatchVO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeOutlineVO;
import com.anynote.note.model.vo.KnowledgeQueryVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeStatsVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.KnowledgeContentService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.note.service.KnowledgeOutlineService;
import com.anynote.note.service.KnowledgeQueryService;
import com.anynote.system.api.model.bo.LoginUser;
import java.lang.reflect.Method;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 知识访问内部端点契约单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeControllerTest {

    @Mock private TokenUtil tokenUtil;
    @Mock private KnowledgeAccessService accessService;
    @Mock private KnowledgeContentService contentService;
    @Mock private KnowledgeOutlineService outlineService;
    @Mock private KnowledgeQueryService queryService;
    @Mock private KnowledgeEntityService entityService;
    @Mock private KnowledgeChangeService changeService;

    private MockMvc mockMvc;
    private LoginUser loginUser;

    @BeforeEach
    void setUp() {
        KnowledgeController controller = new KnowledgeController(tokenUtil, accessService, contentService,
                outlineService, queryService, entityService, changeService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        loginUser = new LoginUser();
        loginUser.setUserId(7L);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    /**
     * 六个用户端点返回统一成功信封并传递登录身份。
     */
    @Test
    void userEndpointsReturnSuccess() throws Exception {
        when(accessService.scope(eq(loginUser), any())).thenReturn(KnowledgeScopeVO.builder()
                .userId(7L).knowledgeBases(List.of()).build());
        mockMvc.perform(post("/internal/v1/knowledge/scope").contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.userId").value(7L));

        when(accessService.authorize(eq(loginUser), any())).thenReturn(KnowledgeAuthorizationVO.builder()
                .items(List.of(KnowledgeAuthorizationItemVO.builder().ref("note:1").readable(true).build())).build());
        mockMvc.perform(post("/internal/v1/knowledge/authorize").contentType("application/json")
                        .content("{\"items\":[{\"ref\":\"note:1\"}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].readable").value(true));

        when(contentService.read(eq(loginUser), any())).thenReturn(KnowledgeContentVO.builder()
                .ref("note:1").content("正文").build());
        mockMvc.perform(post("/internal/v1/knowledge/content").contentType("application/json")
                        .content("{\"ref\":\"note:1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content").value("正文"));

        when(outlineService.outline(eq(loginUser), any())).thenReturn(KnowledgeOutlineVO.builder()
                .ref("kb:1").nodes(List.of()).build());
        mockMvc.perform(post("/internal/v1/knowledge/outline").contentType("application/json")
                        .content("{\"ref\":\"kb:1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.ref").value("kb:1"));

        when(queryService.query(eq(loginUser), any())).thenReturn(KnowledgeQueryVO.builder()
                .rows(List.of()).count(0L).build());
        mockMvc.perform(post("/internal/v1/knowledge/query").contentType("application/json")
                        .content("{\"entity\":\"note\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(0L));

        when(queryService.stats(eq(loginUser), any())).thenReturn(KnowledgeStatsVO.builder()
                .knowledgeBases(List.of(KnowledgeStatsVO.KnowledgeBaseStats.builder().kbId(1L).name("库").role("READ")
                        .counts(Map.of("note", 2L)).build())).build());
        mockMvc.perform(post("/internal/v1/knowledge/stats").contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.knowledgeBases[0].counts.note").value(2L));
    }

    /**
     * 服务间端点覆盖游标、导出、索引状态与总结登记。
     */
    @Test
    void serviceEndpointsReturnSuccess() throws Exception {
        when(changeService.changes(anyLong(), anyInt())).thenReturn(KnowledgeChangePageVO.builder()
                .changes(List.of()).nextCursor(0L).latestCursor(0L).build());
        mockMvc.perform(get("/internal/v1/knowledge/changes"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.nextCursor").value(0L));

        when(entityService.export(anyString(), any(), anyLong(), anyInt())).thenReturn(KnowledgeExportVO.builder()
                .documents(List.of()).hasMore(false).build());
        mockMvc.perform(post("/internal/v1/knowledge/export").contentType("application/json")
                        .content("{\"entityType\":\"note\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.hasMore").value(false));

        mockMvc.perform(put("/internal/v1/knowledge/docs/2/index-status").contentType("application/json")
                        .content("{\"status\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").value("SUCCESS"));

        when(changeService.recordSummaryChange(4L)).thenReturn(9L);
        mockMvc.perform(post("/internal/v1/knowledge/mooc-items/4/summary-changes"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(9L));

        when(entityService.getBatch(List.of("note:1", "note:9"), true)).thenReturn(
                KnowledgeDocumentBatchVO.builder().documents(List.of()).missingRefs(List.of("note:9")).build());
        mockMvc.perform(post("/internal/v1/knowledge/documents/batch").contentType("application/json")
                        .content("{\"refs\":[\"note:1\",\"note:9\"],\"includeBody\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.missingRefs[0]").value("note:9"));

        when(changeService.record(any())).thenReturn(15L);
        mockMvc.perform(post("/internal/v1/knowledge/changes").contentType("application/json")
                        .content("{\"entityType\":\"notice\",\"entityId\":8,\"knowledgeBaseId\":2,\"operation\":\"CREATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(15L));
    }

    /**
     * 复合键批量可读性端点经真实校验器：合法请求成功，空列表、空白键与超过 100 条返回参数错误。
     */
    @Test
    void authorizeBatchPassesRealValidator() throws Exception {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        MockMvc validated = MockMvcBuilders.standaloneSetup(new KnowledgeController(tokenUtil, accessService,
                        contentService, outlineService, queryService, entityService, changeService))
                .setValidator(validator)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        when(accessService.authorizeCombined(eq(loginUser), any())).thenReturn(List.of("note:1"));

        validated.perform(post("/internal/v1/knowledge/authorize-batch").contentType("application/json")
                        .content("{\"refs\":[\"note:1\",\"mooc_item:5#transcript\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("00000"))
                .andExpect(jsonPath("$.data.readable[0]").value("note:1"));
        validated.perform(post("/internal/v1/knowledge/authorize-batch").contentType("application/json")
                        .content("{\"refs\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A0160"));
        validated.perform(post("/internal/v1/knowledge/authorize-batch").contentType("application/json")
                        .content("{\"refs\":[\"note:1\",\" \"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A0160"));
        StringBuilder tooMany = new StringBuilder("{\"refs\":[");
        for (int index = 1; index <= 101; index++) {
            tooMany.append(index > 1 ? "," : "").append("\"note:").append(index).append('"');
        }
        validated.perform(post("/internal/v1/knowledge/authorize-batch").contentType("application/json")
                        .content(tooMany.append("]}").toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("A0160"));
    }

    /**
     * 所有端点都有内部签名，六个用户端点额外要求用户令牌。
     */
    @Test
    void declaresInnerAuthRequirements() throws NoSuchMethodException {
        for (String method : List.of("scope", "authorize", "content", "outline", "query", "stats")) {
            InnerAuth annotation = findMethod(method).getAnnotation(InnerAuth.class);
            assertThat(annotation).isNotNull();
            assertThat(annotation.isUser()).isTrue();
        }
        for (String method : List.of("changes", "export", "updateDocIndexStatus",
                "getBatch", "recordChange", "recordSummaryChange")) {
            InnerAuth annotation = findMethod(method).getAnnotation(InnerAuth.class);
            assertThat(annotation).isNotNull();
            assertThat(annotation.isUser()).isFalse();
        }
    }

    private Method findMethod(String name) {
        return List.of(KnowledgeController.class.getDeclaredMethods()).stream()
                .filter(method -> method.getName().equals(name)).findFirst().orElseThrow();
    }
}
