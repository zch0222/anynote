package com.anynote.ai;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

//@EnableAnyNoteFeignClients
//@EnableCustomConfig
@SpringBootApplication
@EnableFeignClients(basePackages = {"com.anynote"})
@MapperScan({"com.anynote.common.datascope.mapper", "com.anynote.ai.mapper"})
@EnableDiscoveryClient

//@EnableScheduling
public class AnyNoteAIApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnyNoteAIApplication.class, args);
        System.out.println("AI模块，启动！");
    }
}
