package com.anynote.manage.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 *
 */
@Tag(name = "管理-配置", description = "后台系统配置接口")
@RestController
@RequestMapping("sysConfig")
public class ManageSysConfigController {
}
