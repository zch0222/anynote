package com.anynote.note.test;

import com.anynote.common.datascope.service.PermissionService;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.system.api.RemoteSysPermissionRuleService;
import com.anynote.system.api.model.dto.GetSysPermissionRuleDTO;
import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import jakarta.annotation.Resource;

/**
 * 集成测试：需要 MySQL / Redis / Nacos 等中间件就绪才能运行。
 * 默认被 surefire 的 excludedGroups=integration 跳过，
 * 起好中间件后用 mvn test -pl note -am -Dtest.excluded.groups= 单独执行。
 */
@Slf4j
@Tag("integration")
@ExtendWith(SpringExtension.class)
@SpringBootTest
public class PermissionServiceTest {


    @Resource
    private PermissionService permissionService;

    @Resource
    private RemoteSysPermissionRuleService remoteSysPermissionRuleService;

    @Resource
    Gson gson;

    @Test
    void getSysPermissionRule() {
        System.out.println(gson.toJson(remoteSysPermissionRuleService.getSysPermissionRuleById(1L)));
        System.out.println(gson.toJson(remoteSysPermissionRuleService.getSysPermissionRule(GetSysPermissionRuleDTO.builder()
                .permissionRuleName("ndoc:read").build(), SecurityConstants.INNER)));
    }

    @Test
    public void testGetPermission() {
        System.out.println(permissionService.auth("ndoc:read", 47L, 288L));
    }
}
