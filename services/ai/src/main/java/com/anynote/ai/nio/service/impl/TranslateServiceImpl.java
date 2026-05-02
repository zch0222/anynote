package com.anynote.ai.nio.service.impl;

import com.anynote.ai.api.model.bo.Translation;
import com.anynote.ai.api.model.dto.TranslateTextDTO;
import com.anynote.ai.nio.factory.TranslatePluginFactory;
import com.anynote.ai.nio.service.TranslateService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TranslateServiceImpl implements TranslateService {

    @Resource
    private TranslatePluginFactory translatePluginFactory;

    @Override
    public List<Translation> translateText(TranslateTextDTO translateTextDTO) {
        return translatePluginFactory.translatePlugin()
                .translate(translateTextDTO.getText(), translateTextDTO.getTargetLang());
    }
}
