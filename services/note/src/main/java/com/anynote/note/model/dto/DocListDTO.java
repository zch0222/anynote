package com.anynote.note.model.dto;

import lombok.Data;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@Data
public class DocListDTO {

    @NotNull(message = "知识库ID不能为空")
    private Long knowledgeBaseId;

    @NotNull(message = "页码不能为空")
    @Min(value = 1, message = "页码错误")
    private Integer page;

    @NotNull(message = "页面大小错误")
    @Min(value = 1, message = "页面大小错误")
    @Max(value = 50, message = "页面大小错误")
    private Integer pageSize;
}
