package com.anynote.system.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.po.SysOrganization;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 *
 * @author 称霸幼儿园
 */
@Validated
@Tag(name = "组织管理", description = "组织架构管理接口")
@RestController
@RequestMapping("organizations")
public class SysOrganizationController {


    @InnerAuth
    @GetMapping("bases/info/{organizationId}")
    public ResData<SysOrganization> getOrganizationInfoByKnowledgeBaseId(@NotNull(message = "机构id不能为空")
                                                                             @PathVariable Long organizationId) {
        throw new BusinessException("按知识库 ID 查询组织信息暂未实现", ResCode.BUSINESS_ERROR);
    }
}
