package com.anynote.ai.run;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeAuthorizeBatchDTO;
import com.anynote.note.api.model.vo.KnowledgeAuthorizeBatchVO;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 过程视图读取复核单元测试（T1 三分支）。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ProcessViewRecheckTest {

    @Mock
    private RemoteKnowledgeService remoteKnowledgeService;

    private ProcessViewRecheck recheck;

    @BeforeEach
    void setUp() {
        recheck = new ProcessViewRecheck(remoteKnowledgeService, new Gson());
    }

    private ChatMessage messageWith(String processJson) {
        ChatMessage message = new ChatMessage();
        message.setRunId("run-1");
        message.setProcess(processJson);
        return message;
    }

    /**
     * 验证全部依赖可读时原样返回（hidden 保持 false）。
     */
    @Test
    @DisplayName("依赖全部可读时原样返回")
    void returnsProcessWhenAllDependenciesReadable() {
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenReturn(ResData.success(KnowledgeAuthorizeBatchVO.builder()
                        .readable(List.of("note:12", "doc:7"))
                        .build()));

        Map<String, Object> result = recheck.recheck(messageWith("""
                {"version":1,"hidden":false,"dependencies":["note:12","doc:7"],"items":[]}
                """));

        assertThat(result).isNotNull();
        assertThat(result.get("hidden")).isEqualTo(false);
        assertThat(result).containsKey("dependencies");
    }

    /**
     * 验证任一依赖不可读时隐藏自由文本并置 hidden，工具结果条目按可读性替换。
     */
    @Test
    @DisplayName("依赖不可读时隐藏思考与过程说明并过滤结果条目")
    void hidesFreeTextWhenAnyDependencyUnreadable() {
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenReturn(ResData.success(KnowledgeAuthorizeBatchVO.builder()
                        .readable(List.of("note:12"))
                        .build()));

        Map<String, Object> result = recheck.recheck(messageWith("""
                {"version":1,"hidden":false,"durationMs":500,
                 "dependencies":["note:12","doc:7"],
                 "items":[
                   {"type":"reasoning","text":"先想一下","status":"done"},
                   {"type":"note","text":"过程说明"},
                   {"type":"retry"},
                   {"type":"tool","name":"kb_search","target":{"label":"期末复习","resolved":true},
                    "status":"SUCCESS","result":{"count":2,"items":[
                      {"ref":"note:12","title":"可读","kbName":"库"},
                      {"ref":"doc:7","title":"不可读","kbName":"库"}]}}
                 ]}
                """));

        assertThat(result).isNotNull();
        assertThat(result.get("hidden")).isEqualTo(true);
        assertThat(result.get("hiddenNotice")).isEqualTo("部分内容你已无权访问，思考过程已隐藏");
        assertThat(result).doesNotContainKey("dependencies");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertThat(items.get(0).get("text")).isNull();
        assertThat(items.get(1).get("text")).isNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> tool = items.get(3);
        assertThat(tool.get("target")).isNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> toolResult = (Map<String, Object>) tool.get("result");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> resultItems = (List<Map<String, Object>>) toolResult.get("items");
        assertThat(resultItems).hasSize(1);
        assertThat(resultItems.get(0).get("ref")).isEqualTo("note:12");
    }

    /**
     * 验证 note 不可用（Feign 降级返回错误码）时不返回过程视图。
     */
    @Test
    @DisplayName("note 不可用时返回 null（宁可不显示）")
    void returnsNullWhenNoteUnavailable() {
        ResData<KnowledgeAuthorizeBatchVO> failure = new ResData<>();
        failure.setCode("B0403");
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenReturn(failure);

        assertThat(recheck.recheck(messageWith("""
                {"version":1,"dependencies":["note:12"],"items":[]}
                """))).isNull();
    }

    /**
     * 验证空过程或非法 JSON 返回 null。
     */
    @Test
    @DisplayName("空与非法过程视图返回 null")
    void returnsNullForEmptyOrInvalidProcess() {
        assertThat(recheck.recheck(null)).isNull();
        assertThat(recheck.recheck(messageWith(""))).isNull();
        assertThat(recheck.recheck(messageWith("not-json"))).isNull();
    }

    /**
     * 验证依赖超过 100 条时分批复核。
     */
    @Test
    @DisplayName("依赖超过单批上限时分批复核")
    void batchesBeyondHundredDependencies() {
        StringBuilder deps = new StringBuilder("[");
        for (int index = 1; index <= 150; index++) {
            if (index > 1) {
                deps.append(',');
            }
            deps.append("\"note:").append(index).append('"');
        }
        deps.append(']');
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenAnswer(invocation -> {
                    KnowledgeAuthorizeBatchDTO dto = invocation.getArgument(0);
                    return ResData.success(KnowledgeAuthorizeBatchVO.builder()
                            .readable(dto.getRefs())
                            .build());
                });

        Map<String, Object> result = recheck.recheck(messageWith(
                "{\"version\":1,\"hidden\":false,\"dependencies\":" + deps + ",\"items\":[]}"));

        assertThat(result).isNotNull();
        assertThat(result.get("hidden")).isEqualTo(false);
    }
}
