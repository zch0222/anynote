package com.anynote.ai.controller;

import com.anynote.ai.model.dto.ModelProviderUpsertDTO;
import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.constant.Constants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 模型供应商配置（内部）控制器。
 *
 * <p>三个端点都只供内部服务调用，统一挂 {@link InnerAuth} 校验内部签名；网关不路由本路径，
 * 外部请求无法直接到达。快照端点返回解密后的 apiKey，调用方只能在内存中使用。</p>
 *
 * @author 称霸幼儿园
 */
@Tag(name = "模型供应商配置（内部）", description = "模型供应商目录与凭据快照接口，仅内部签名调用")
@RestController
@RequestMapping("/internal/v1/model-providers")
public class ModelProviderController {

    private final ModelProviderService modelProviderService;

    /**
     * 构造器注入。
     *
     * @param modelProviderService 模型供应商服务
     */
    public ModelProviderController(ModelProviderService modelProviderService) {
        this.modelProviderService = modelProviderService;
    }

    /**
     * 获取模型供应商配置快照。
     *
     * @return 版本号、供应商列表（含解密后的 apiKey）与逻辑模型映射
     */
    @InnerAuth
    @Operation(summary = "获取模型供应商配置快照",
            description = "返回快照版本号、全部供应商（apiKey 已解密）与 Nacos 逻辑模型映射，供内部调用方缓存比对")
    @GetMapping("/snapshot")
    public ResData<ModelProviderSnapshotVO> snapshot() {
        return ResUtil.success(modelProviderService.snapshot());
    }

    /**
     * 新增或更新模型供应商。
     *
     * @param dto 供应商配置，apiKey 为明文入参
     * @return 操作完成后的快照版本号
     */
    @InnerAuth
    @Operation(summary = "新增或更新模型供应商",
            description = "按 providerKey 判断新增或更新；apiKey 明文入参，服务端 AES-GCM 加密后落库；返回更新后的快照版本号")
    @PostMapping
    public ResData<String> upsert(@Validated @RequestBody ModelProviderUpsertDTO dto) {
        return ResUtil.success(modelProviderService.upsert(dto));
    }

    /**
     * 按供应商标识删除模型供应商。
     *
     * @param providerKey 供应商标识
     * @return 成功返回 {@code SUCCESS}；不存在返回错误码 A0404
     */
    @InnerAuth
    @Operation(summary = "删除模型供应商",
            description = "按 providerKey 硬删除供应商；记录不存在返回 A0404")
    @DeleteMapping("/{providerKey}")
    public ResData<String> delete(@PathVariable("providerKey") String providerKey) {
        if (!modelProviderService.delete(providerKey)) {
            return ResData.error(ResCode.INVALID_USER_INPUT_NOT_FOUND, "模型供应商不存在: " + providerKey);
        }
        return ResUtil.success(Constants.SUCCESS_RES);
    }
}
