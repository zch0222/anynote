package com.anynote.ai.run;

import com.anynote.ai.api.model.po.ChatMessage;
import com.anynote.ai.model.vo.AgentProcessViewVO;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteKnowledgeService;
import com.anynote.note.api.model.dto.KnowledgeAuthorizeBatchDTO;
import com.anynote.note.api.model.vo.KnowledgeAuthorizeBatchVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 过程视图读取复核单元测试：三条判定路径只返回契约字段、整段会话批量复核与降级。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class ProcessViewRecheckTest {

    @Mock
    private RemoteKnowledgeService remoteKnowledgeService;

    private final Gson gson = new Gson();

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ProcessViewRecheck recheck;

    @BeforeEach
    void setUp() {
        recheck = new ProcessViewRecheck(remoteKnowledgeService, gson);
    }

    /**
     * 依赖全部可读时返回全部行与文字，结果里没有 dependencies，行字段与共享样例一致。
     */
    @Test
    @DisplayName("依赖全部可读时返回契约字段")
    void allReadableReturnsContractFieldsOnly() throws Exception {
        allowReadable("note:12", "doc:7");

        AgentProcessViewVO view = recheck.recheckAll(List.of(messageWith(fixtureJson()))).get(0);

        JsonNode actual = toTree(view);
        JsonNode stored = objectMapper.readTree(fixtureJson());
        assertThat(actual.has("dependencies")).isFalse();
        assertThat(actual.has("reasoningChars")).isFalse();
        assertThat(actual.get("hidden").asBoolean()).isFalse();
        assertThat(actual.get("items")).isEqualTo(stored.get("items"));
    }

    /**
     * 依赖为空时不调用 note，同样只返回契约字段。
     */
    @Test
    @DisplayName("依赖为空时不复核并返回契约字段")
    void emptyDependenciesSkipNoteAndReturnContractFields() throws Exception {
        AgentProcessViewVO view = recheck.recheckAll(List.of(messageWith(
                "{\"version\":1,\"durationMs\":10,\"reasoningChars\":3,\"dependencies\":[],"
                        + "\"items\":[{\"type\":\"reasoning\",\"id\":\"b1\",\"text\":\"想\",\"status\":\"done\"}]}"))).get(0);

        JsonNode actual = toTree(view);
        assertThat(actual.has("dependencies")).isFalse();
        assertThat(actual.has("reasoningChars")).isFalse();
        assertThat(actual.get("items").get(0).get("text").asText()).isEqualTo("想");
        verify(remoteKnowledgeService, never()).authorizeBatch(any());
    }

    /**
     * 任一依赖不可读时的隐藏视图与共享样例 agent-process-view.hidden.json 结构相等。
     */
    @Test
    @DisplayName("部分依赖不可读时的隐藏视图等于共享样例")
    void partiallyReadableMatchesHiddenFixture() throws Exception {
        allowReadable("note:12");

        AgentProcessViewVO view = recheck.recheckAll(List.of(messageWith(fixtureJson()))).get(0);

        JsonNode expected = objectMapper.readTree(AgentRunProcessViewTest.readFixture("agent-process-view.hidden.json"));
        assertThat(toTree(view)).isEqualTo(expected);
    }

    /**
     * 三条消息共享部分依赖时，按去重后的依赖每 100 条调用一次 note，判定与逐条复核一致。
     */
    @Test
    @DisplayName("整段会话去重后批量复核")
    void batchesDependenciesAcrossMessages() {
        List<String> first = refs(1, 80);
        List<String> second = refs(60, 150);
        List<String> third = refs(140, 230);
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class))).thenAnswer(invocation -> {
            KnowledgeAuthorizeBatchDTO request = invocation.getArgument(0);
            List<String> readable = request.getRefs().stream().filter(ref -> !"note:200".equals(ref)).toList();
            return ResData.success(KnowledgeAuthorizeBatchVO.builder().readable(readable).build());
        });

        List<AgentProcessViewVO> views = recheck.recheckAll(List.of(
                messageWith(viewJson(first)), messageWith(viewJson(second)), messageWith(viewJson(third))));

        ArgumentCaptor<KnowledgeAuthorizeBatchDTO> captor = ArgumentCaptor.forClass(KnowledgeAuthorizeBatchDTO.class);
        verify(remoteKnowledgeService, times(3)).authorizeBatch(captor.capture());
        assertThat(captor.getAllValues()).extracting(dto -> dto.getRefs().size()).containsExactly(100, 100, 30);
        assertThat(views).extracting(AgentProcessViewVO::getHidden).containsExactly(false, false, true);
    }

    /**
     * note 不可用时有依赖的过程视图不返回，没有依赖的照常返回。
     */
    @Test
    @DisplayName("note 不可用时只丢弃有依赖的过程视图")
    void noteUnavailableDropsViewsWithDependencies() {
        ResData<KnowledgeAuthorizeBatchVO> failure = new ResData<>();
        failure.setCode("B0403");
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class))).thenReturn(failure);

        List<AgentProcessViewVO> views = recheck.recheckAll(List.of(
                messageWith(viewJson(List.of("note:1"))),
                messageWith(viewJson(List.of()))));

        assertThat(views.get(0)).isNull();
        assertThat(views.get(1)).isNotNull();
    }

    /**
     * Feign 抛异常时同样按不可用处理。
     */
    @Test
    @DisplayName("Feign 异常按不可用处理")
    void feignExceptionTreatedAsUnavailable() {
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenThrow(new IllegalStateException("down"));

        assertThat(recheck.recheckAll(List.of(messageWith(viewJson(List.of("note:1")))))).containsExactly((AgentProcessViewVO) null);
    }

    /**
     * 没有过程视图或 JSON 非法的位置返回 null，并保持与输入同序。
     */
    @Test
    @DisplayName("空与非法过程视图返回 null")
    void returnsNullForEmptyOrInvalidProcess() {
        List<ChatMessage> messages = new ArrayList<>(Arrays.asList(null, messageWith(""), messageWith("not-json")));

        assertThat(recheck.recheckAll(messages)).containsExactly(null, null, null);
        assertThat(recheck.recheckAll(List.of())).isEmpty();
    }

    /**
     * 按浏览器实际收到的 JSON 文本转换为节点，数值类型与读样例时一致。
     */
    private JsonNode toTree(Object value) throws Exception {
        return objectMapper.readTree(objectMapper.writeValueAsString(value));
    }

    private void allowReadable(String... refs) {
        when(remoteKnowledgeService.authorizeBatch(any(KnowledgeAuthorizeBatchDTO.class)))
                .thenReturn(ResData.success(KnowledgeAuthorizeBatchVO.builder().readable(List.of(refs)).build()));
    }

    private String fixtureJson() throws Exception {
        return AgentRunProcessViewTest.readFixture("agent-process-view.json");
    }

    private String viewJson(List<String> dependencies) {
        return "{\"version\":1,\"items\":[{\"type\":\"retry\",\"id\":\"r1\"}],\"dependencies\":"
                + gson.toJson(dependencies) + "}";
    }

    private List<String> refs(int from, int to) {
        List<String> refs = new ArrayList<>();
        for (int index = from; index <= to; index++) {
            refs.add("note:" + index);
        }
        return refs;
    }

    private ChatMessage messageWith(String processJson) {
        ChatMessage message = new ChatMessage();
        message.setRunId("run-1");
        message.setProcess(processJson);
        return message;
    }
}
