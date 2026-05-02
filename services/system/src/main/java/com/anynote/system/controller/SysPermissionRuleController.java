package com.anynote.system.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.dto.GetSysPermissionRuleDTO;
import com.anynote.system.api.model.po.SysPermissionRule;
import com.anynote.system.service.SysPermissionRuleService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import javax.validation.Valid;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "权限规则", description = "权限规则管理接口")
@RestController
@RequestMapping("permissionRules")
public class SysPermissionRuleController {

    @Resource
    private SysPermissionRuleService sysPermissionRuleService;


    @InnerAuth
    @GetMapping("{id}")
    public ResData<SysPermissionRule> getSysPermissionRuleById(@PathVariable("id") Long id) {
        return ResData.success(sysPermissionRuleService.getById(id));
    }

    @InnerAuth
    @GetMapping("")
    public ResData<SysPermissionRule> getSysPermissionRule(@Valid GetSysPermissionRuleDTO getSysPermissionRuleDTO) {
        return ResData.success(sysPermissionRuleService.getSysPermissionRule(getSysPermissionRuleDTO));
    }
}
