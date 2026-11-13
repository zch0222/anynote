package com.anynote.ai.service.impl;

import com.anynote.ai.api.model.po.WhisperTaskLog;
import com.anynote.ai.mapper.WhisperTaskLogMapper;
import com.anynote.ai.service.WhisperTaskLogService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class WhisperTaskLogServiceImpl extends ServiceImpl<WhisperTaskLogMapper, WhisperTaskLog>
        implements WhisperTaskLogService {
}
