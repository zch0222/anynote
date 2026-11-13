package com.anynote.ai.config;

import com.anynote.ai.properties.FFmpegExecutorProperties;
import com.anynote.ai.properties.WhisperExecutorProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.VirtualThreadTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import jakarta.annotation.Resource;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 线程池配置：IO 与流式转发使用虚拟线程，whisper 与 ffmpeg 保留有界平台线程池。
 *
 * @author 称霸幼儿园
 */
@Configuration
public class ThreadPoolConfig {

    @Resource
    private WhisperExecutorProperties whisperExecutorProperties;

    @Resource
    private FFmpegExecutorProperties fFmpegExecutorProperties;

    /**
     * whisper 任务线程池
     *
     * @return whisper 任务线程池
     */
    @Bean("whisperExecutor")
    public Executor whisperExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(whisperExecutorProperties.getCorePoolSize());
        executor.setMaxPoolSize(whisperExecutorProperties.getMaxPoolSize());
        executor.setQueueCapacity(whisperExecutorProperties.getQueueCapacity());
        executor.setThreadNamePrefix("whisperExecutor-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setKeepAliveSeconds(60);
        executor.setAllowCoreThreadTimeOut(true);
        executor.initialize();
        return executor;
    }

    /**
     * 通用 IO 与流式转发执行器，每条任务一个虚拟线程。
     *
     * @return 虚拟线程执行器
     */
    @Bean("ioExecutor")
    public Executor ioExecutor() {
        return new VirtualThreadTaskExecutor("anynote-ai-io-");
    }

    /**
     * ffmpeg 线程池
     *
     * @return ffmpeg 线程池
     */
    @Bean("ffmpegExecutor")
    public Executor ffmpegExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(fFmpegExecutorProperties.getCorePoolSize());
        executor.setMaxPoolSize(fFmpegExecutorProperties.getMaxPoolSize());
        executor.setQueueCapacity(fFmpegExecutorProperties.getQueueCapacity());
        executor.setThreadNamePrefix("ffmpegExecutor-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setKeepAliveSeconds(60);
        executor.setAllowCoreThreadTimeOut(true);
        executor.initialize();
        return executor;
    }
}
