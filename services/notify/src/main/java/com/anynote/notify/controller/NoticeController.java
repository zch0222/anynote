package com.anynote.notify.controller;

import com.anynote.core.constant.SpringWebfluxContextConstants;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.notify.model.dto.NoticeListDTO;
import com.anynote.notify.model.vo.NoticeVO;
import com.anynote.notify.service.NoticeService;
import com.anynote.system.api.model.bo.LoginUser;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import javax.annotation.Resource;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "公告", description = "系统公告接口")
@RestController
@RequestMapping("notices")
public class NoticeController {

    @Resource
    private NoticeService noticeService;

    /**
     * 获取通知列表
     * @param noticeListDTO
     * @return
     */
    @GetMapping("")
    public Mono<ResData<PageBean<NoticeVO>>> getNotices(@Validated NoticeListDTO noticeListDTO) {
        return noticeService.getNoticeList(noticeListDTO)
                .flatMap(noticeVOPageBean ->
                        Mono.just(ResUtil.success(noticeVOPageBean)));
    }
}
