package com.anynote.ai.controller;

import com.anynote.ai.model.dto.ModelProviderCreateDTO;
import com.anynote.ai.model.dto.ModelProviderUpdateDTO;
import com.anynote.ai.model.vo.ModelProviderAdminVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.core.constant.Constants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.bo.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统管理员模型供应商 CRUD 控制器。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "模型供应商管理", description = "仅系统管理员可查询和修改")
@RestController
@RequestMapping("/v1/admin/model-providers")
public class ModelProviderAdminController {

    private final ModelProviderService modelProviderService;

    private final SystemAdminGuard systemAdminGuard;

    /**
     * 构造器注入。
     *
     * @param modelProviderService 模型供应商服务
     * @param systemAdminGuard 系统管理员准入组件
     */
    public ModelProviderAdminController(ModelProviderService modelProviderService,
                                        SystemAdminGuard systemAdminGuard) {
        this.modelProviderService = modelProviderService;
        this.systemAdminGuard = systemAdminGuard;
    }

    /**
     * 查询供应商列表。
     *
     * @return 不含凭据的供应商列表
     */
    @Operation(summary = "查询模型供应商列表")
    @GetMapping
    public ResData<List<ModelProviderAdminVO>> list() {
        systemAdminGuard.requireAdmin();
        return ResUtil.success(modelProviderService.list());
    }

    /**
     * 查询供应商详情。
     *
     * @param providerKey 供应商标识
     * @return 不含凭据的供应商详情
     */
    @Operation(summary = "查询模型供应商详情")
    @GetMapping("/{providerKey}")
    public ResData<ModelProviderAdminVO> get(
            @Parameter(description = "供应商标识") @PathVariable String providerKey) {
        systemAdminGuard.requireAdmin();
        return ResUtil.success(modelProviderService.get(providerKey));
    }

    /**
     * 新增供应商。
     *
     * @param dto 新增请求
     * @return 不含凭据的新增结果
     */
    @Operation(summary = "新增模型供应商")
    @PostMapping
    public ResData<ModelProviderAdminVO> create(@Valid @RequestBody ModelProviderCreateDTO dto) {
        LoginUser operator = systemAdminGuard.requireAdmin();
        return ResUtil.success(modelProviderService.create(dto, operator.getUserId()));
    }

    /**
     * 整体更新供应商。
     *
     * @param providerKey 供应商标识
     * @param dto 整体更新请求
     * @return 不含凭据的更新结果
     */
    @Operation(summary = "整体更新模型供应商")
    @PutMapping("/{providerKey}")
    public ResData<ModelProviderAdminVO> update(
            @Parameter(description = "供应商标识") @PathVariable String providerKey,
            @Valid @RequestBody ModelProviderUpdateDTO dto) {
        LoginUser operator = systemAdminGuard.requireAdmin();
        return ResUtil.success(modelProviderService.update(providerKey, dto, operator.getUserId()));
    }

    /**
     * 删除供应商。
     *
     * @param providerKey 供应商标识
     * @return 成功标识
     */
    @Operation(summary = "删除模型供应商")
    @DeleteMapping("/{providerKey}")
    public ResData<String> delete(
            @Parameter(description = "供应商标识") @PathVariable String providerKey) {
        systemAdminGuard.requireAdmin();
        modelProviderService.delete(providerKey);
        return ResUtil.success(Constants.SUCCESS_RES);
    }
}
