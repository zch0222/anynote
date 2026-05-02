package com.anynote.notify.model.dto;

import lombok.Data;
import lombok.NonNull;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;

/**
 * @author 称霸幼儿园
 */
@Data
@Validated
public class NoticeDTO {

    @NotEmpty(message = "消息平台不能为空")
    @Pattern(regexp = "WEB", message = "平台错误")
    private String platform;

}
