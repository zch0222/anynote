package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 笔记创建DTO
 * @author 称霸幼儿园
 */
@Schema(description = "笔记创建参数")
@Data
public class NoteCreateDTO {

    @Schema(description = "笔记标题，长度 3-15")
    @NotBlank(message = "笔记标题不能为空")
    @Size(max = 15, min = 3)
    private String title;

    /**
     * 知识库id
     */
    @Schema(description = "所属知识库id")
    @NotNull(message = "知识库id不能为空")
    private Long knowledgeBaseId;
}
