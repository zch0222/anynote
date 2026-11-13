package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.po.WhisperTask;
import com.anynote.ai.mapper.WhisperTaskMapper;
import com.anynote.ai.service.WhisperTaskService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class WhisperTaskServiceImpl extends ServiceImpl<WhisperTaskMapper, WhisperTask>
        implements WhisperTaskService {
}
