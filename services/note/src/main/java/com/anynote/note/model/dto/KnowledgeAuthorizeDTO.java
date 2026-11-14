package com.anynote.note.model.dto;

import com.anynote.note.constant.KnowledgeErrorConstants;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 批量可读性请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "批量可读性请求")
public class KnowledgeAuthorizeDTO {

    @Valid
    @NotEmpty(message = KnowledgeErrorConstants.INVALID_ENTITY)
    @Size(max = 100, message = KnowledgeErrorConstants.TOO_MANY)
    @Schema(description = "待判定实体列表")
    private List<Item> items;

    /**
     * 单个待判定实体。
     */
    @Data
    @Schema(description = "待判定实体")
    public static class Item {

        @NotBlank(message = KnowledgeErrorConstants.INVALID_ENTITY)
        @Schema(description = "基础实体标识")
        private String ref;

        @Schema(description = "慕课条目附属类型", allowableValues = {"transcript", "summary"})
        private String subtype;
    }
}
