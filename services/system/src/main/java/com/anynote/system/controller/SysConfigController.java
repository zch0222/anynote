package com.anynote.system.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.po.SysConfig;
import com.anynote.system.service.SysConfigService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.util.List;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * @author 称霸幼儿园
 */
@Tag(name = "系统配置", description = "系统配置管理接口")
@RestController
@RequestMapping("")
public class SysConfigController {

    @Resource
    private SysConfigService sysConfigService;

    @InnerAuth
    @GetMapping("")
    public ResData<List<SysConfig>> getSysConfigs() {
        return ResUtil.success(sysConfigService.getSysConfigs());
    }
}
