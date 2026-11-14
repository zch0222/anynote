package com.anynote.note.api.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 内部登记知识变更请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeChangeRecordDTO {

    /**
     * 知识实体类型。
     */
    @NotBlank(message = "知识实体参数不合法")
    private String entityType;

    /**
     * 实体主键 id。
     */
    @NotNull(message = "知识实体参数不合法")
    @Positive(message = "知识实体参数不合法")
    private Long entityId;

    /**
     * 所属知识库 id，无所属知识库时传 0。
     */
    private Long knowledgeBaseId;

    /**
     * 变更操作（CREATE、UPDATE、DELETE）。
     */
    @NotBlank(message = "知识实体参数不合法")
    private String operation;
}
