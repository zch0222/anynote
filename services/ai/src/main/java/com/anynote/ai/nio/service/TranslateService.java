package com.anynote.ai.nio.service;

import com.anynote.ai.api.model.bo.Translation;
import com.anynote.ai.api.model.dto.TranslateTextDTO;

import java.util.List;

public interface TranslateService {

    List<Translation> translateText(TranslateTextDTO translateTextDTO);

}
