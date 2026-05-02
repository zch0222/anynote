package com.anynote.ai.nio.factory;

import com.alibaba.fastjson2.JSON;
import com.anynote.ai.nio.enums.TranslateType;
import com.anynote.ai.nio.model.bo.DeepLConfig;
import com.anynote.ai.nio.plugin.TranslatePlugin;
import com.anynote.ai.nio.plugin.impl.DeepLTranslatePlugin;
import com.anynote.common.redis.service.RedisService;
import com.anynote.core.enums.ConfigEnum;
import com.anynote.core.exception.BusinessException;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class TranslatePluginFactory {

    @Resource
    private RedisService redisService;

    @Resource
    private RestTemplate restTemplate;

    public TranslatePlugin translatePlugin() {
        switch (TranslateType.valueOf(redisService.getConfig(ConfigEnum.TRANSLATE_TYPE).getValue())) {
            case DEEPL: {
                DeepLConfig deepLConfig = JSON.parseObject(
                        redisService.getConfig(ConfigEnum.DEEPL_CONFIG).getValue(), DeepLConfig.class);
                return new DeepLTranslatePlugin(deepLConfig, restTemplate);
            }
            default:
                throw new BusinessException("翻译失败");
        }
    }
}
