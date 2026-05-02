package com.anynote.ai.nio.plugin;

import com.anynote.ai.api.model.bo.Translation;

import java.util.List;

public interface TranslatePlugin {

    List<Translation> translate(List<String> text, String targetLang);

}
