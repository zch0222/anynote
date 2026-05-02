package com.anynote.note.model.dto;

import lombok.Data;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;

/**
 * @author 称霸幼儿园
 */
@Data
public class DocRagQueryDTO {
    private Long conversationId;

    @NotEmpty(message = "问题不能为空")
    private String prompt;
}
