package com.anynote.ai.controller;

import com.anynote.ai.model.dto.RetrievalSettingUpdateDTO;
import com.anynote.ai.model.vo.RetrievalSettingVO;
import com.anynote.ai.security.SystemAdminGuard;
import com.anynote.ai.service.RetrievalSettingService;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.system.api.model.bo.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 知识检索运行参数管理端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "检索参数管理", description = "仅系统管理员可查询和修改")
@RestController
@RequestMapping("/v1/admin/retrieval-settings")
public class RetrievalSettingAdminController {

    private final RetrievalSettingService retrievalSettingService;
    private final SystemAdminGuard systemAdminGuard;

    /**
     * 构造检索参数管理端点。
     *
     * @param retrievalSettingService 检索参数服务
     * @param systemAdminGuard 系统管理员准入组件
     */
    public RetrievalSettingAdminController(RetrievalSettingService retrievalSettingService,
                                           SystemAdminGuard systemAdminGuard) {
        this.retrievalSettingService = retrievalSettingService;
        this.systemAdminGuard = systemAdminGuard;
    }

    /**
     * 查询当前检索参数。
     *
     * @return 当前参数，未保存过时为默认值
     */
    @Operation(summary = "查询检索参数", description = "未保存过时返回默认值，版本为 0")
    @GetMapping
    public ResData<RetrievalSettingVO> getSettings() {
        systemAdminGuard.requireAdmin();
        return ResUtil.success(retrievalSettingService.get());
    }

    /**
     * 整体更新检索参数，新值只影响之后开始的运行。
     *
     * @param dto 全部检索参数
     * @return 保存后的参数
     */
    @Operation(summary = "更新检索参数", description = "全部字段必填，越界时返回参数错误")
    @PutMapping
    public ResData<RetrievalSettingVO> updateSettings(@Valid @RequestBody RetrievalSettingUpdateDTO dto) {
        LoginUser operator = systemAdminGuard.requireAdmin();
        return ResUtil.success(retrievalSettingService.update(dto, operator.getUserId()));
    }
}
