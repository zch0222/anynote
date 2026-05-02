package com.anynote.note.api.model.dto;


import lombok.Data;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * @author 称霸幼儿园
 */
@Data
public class DeleteUserKnowledgeBaseDTO {

    @NotNull(message = "知识库id不能为空")
    private Long knowledgeBaseId;

    @NotNull(message = "用户id不能为空")
    private Long userId;
}
