package com.anynote.ai.model.bo;

import lombok.Data;

@Data
public class WhisperConfig {

    private String baseUrl;

    private String apiKey;

    private String tmpFileFolder;
}
