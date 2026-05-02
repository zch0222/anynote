package com.anynote.notify.controller;

import com.anynote.core.web.model.bo.ResData;
import com.anynote.notify.model.dto.NoticeDTO;
import com.anynote.notify.service.NotificationService;
//import org.apache.rocketmq.client.apis.ClientException;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import javax.annotation.Resource;
import javax.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "通知", description = "用户通知相关接口")
@RestController
@RequestMapping("/notification")
public class NotificationController {


    @Resource
    private NotificationService notificationService;

    @GetMapping("")
    public Flux<ServerSentEvent<String>> notice(@Validated NoticeDTO noticeDTO,
                                                         @Validated @NotNull(message = "Token不能为空") @RequestHeader("accessToken") String accessToken) {
        return notificationService.notice(noticeDTO, accessToken);
    }
}
