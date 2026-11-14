package com.anynote.note.service.impl;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.anynote.note.api.model.po.UserKnowledgeBase;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.UserKnowledgeBaseMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 读取共享 JSON 权限矩阵验证详情、列表与最终可读性。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeAccessServiceImplMatrixTest {

    @Mock
    private KnowledgeEntityService knowledgeEntityService;
    @Mock
    private UserKnowledgeBaseMapper userKnowledgeBaseMapper;
    @Mock
    private UserNoteTaskMapper userNoteTaskMapper;

    @BeforeAll
    static void initTableInfo() {
        for (Class<?> type : new Class<?>[]{UserKnowledgeBase.class, UserNoteTask.class}) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    /**
     * 执行 JSON 中的全部权限用例。
     *
     * @return 动态权限用例
     * @throws IOException 矩阵读取失败
     */
    @TestFactory
    Stream<DynamicTest> permissionMatrix() throws IOException {
        JSONArray cases;
        try (InputStream input = getClass().getResourceAsStream("/knowledge/access-matrix.json")) {
            cases = JSON.parseObject(new String(input.readAllBytes(), StandardCharsets.UTF_8)).getJSONArray("cases");
        }
        return cases.stream().map(value -> {
            JSONObject testCase = (JSONObject) value;
            return DynamicTest.dynamicTest(testCase.getString("id"), () -> verifyCase(testCase));
        });
    }

    private void verifyCase(JSONObject testCase) {
        KnowledgeAccessServiceImpl service = new KnowledgeAccessServiceImpl(knowledgeEntityService,
                userKnowledgeBaseMapper, userNoteTaskMapper);
        KnowledgeEntityType type = KnowledgeEntityType.parse(testCase.getString("entityType"));
        KnowledgeRef ref = KnowledgeRef.of(type, 55L);
        LoginUser user = user(testCase.getString("role"));
        Long authorId = "AUTHOR".equals(testCase.getString("role")) ? 7L : 77L;
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(ref.ref())
                .entityType(type.getValue())
                .subtype(ref.subtype())
                .entityId(ref.getId())
                .kbId(type == KnowledgeEntityType.KNOWLEDGE_BASE ? ref.getId() : 55L)
                .title("测试")
                .acl(KnowledgeSourceDocumentVO.Acl.builder()
                        .createBy(authorId)
                        .permissions(testCase.getString("permissions"))
                        .dataScope(testCase.getInteger("dataScope"))
                        .build())
                .build();
        when(knowledgeEntityService.get(any(), eq(false))).thenReturn(document);
        Integer kbPermission = testCase.getInteger("kbPermission");
        when(userKnowledgeBaseMapper.selectOne(any())).thenReturn(kbPermission == null ? null
                : UserKnowledgeBase.builder().userId(user == null ? null : user.getUserId())
                .knowledgeBaseId(55L).permissions(kbPermission).build());
        Integer taskPermission = testCase.getInteger("taskPermission");
        when(userNoteTaskMapper.selectOne(any())).thenReturn(taskPermission == null ? null
                : UserNoteTask.builder().userId(user.getUserId()).noteTaskId(55L)
                .permissions(taskPermission).status(0).build());

        assertEquals(testCase.getIntValue("expectedDetail"), service.getPermission(user, ref), "detail");
        assertEquals(testCase.getBooleanValue("expectedListVisible"), service.isListVisible(user, ref), "list");
        assertEquals(testCase.getBooleanValue("expectedReadable"), service.isReadable(user, ref), "readable");
    }

    private LoginUser user(String role) {
        if ("ANONYMOUS".equals(role)) {
            return null;
        }
        long id = switch (role) {
            case "AUTHOR" -> 7L;
            case "KB_MANAGER" -> 8L;
            case "EDITOR" -> 9L;
            case "READER" -> 10L;
            case "DISABLED_MEMBER" -> 11L;
            case "ADMIN" -> 12L;
            default -> 13L;
        };
        SysRole sysRole = new SysRole();
        sysRole.setRoleKey("ADMIN".equals(role) ? "ADMIN_X" : "COMMON");
        SysUser sysUser = new SysUser();
        sysUser.setId(id);
        sysUser.setRole(sysRole);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(id);
        loginUser.setSysUser(sysUser);
        return loginUser;
    }
}
