package com.anynote.ai.api.factory;

import com.anynote.ai.api.RemoteMoocVideoSummarizeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteMoocVideoFallbackFactory implements FallbackFactory<RemoteMoocVideoSummarizeService> {


    @Override
    public RemoteMoocVideoSummarizeService create(Throwable cause) {
        return null;
    }
}
