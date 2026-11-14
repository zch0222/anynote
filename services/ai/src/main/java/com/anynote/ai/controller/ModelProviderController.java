package com.anynote.ai.controller;

import com.anynote.ai.model.vo.ModelProviderSnapshotVO;
import com.anynote.ai.service.ModelProviderService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Python 使用的模型供应商内部快照控制器。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "模型供应商配置（内部）", description = "仅供内部签名调用")
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
     * @return 版本号、供应商与逻辑模型映射
     */
    @InnerAuth
    @Operation(summary = "获取模型供应商配置快照",
            description = "返回快照版本、供应商内部明文凭据与 Nacos 逻辑模型映射")
    @GetMapping("/snapshot")
    public ResData<ModelProviderSnapshotVO> snapshot() {
        return ResUtil.success(modelProviderService.snapshot());
    }
}
