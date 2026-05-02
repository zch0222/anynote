package com.anynote.ai.nio.controller;

import com.anynote.ai.api.model.bo.Translation;
import com.anynote.ai.api.model.dto.TranslateTextDTO;
import com.anynote.ai.nio.service.TranslateService;
import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "翻译", description = "文本翻译接口")
@RestController
@RequestMapping("translate")
public class TranslateController {

    @Resource
    private TranslateService translateService;

    @Operation(summary = "翻译文本")
    @InnerAuth
    @PostMapping("")
    public ResData<List<Translation>> translateText(@RequestBody TranslateTextDTO translateTextDTO) {
        return ResUtil.success(translateService.translateText(translateTextDTO));
    }

}
