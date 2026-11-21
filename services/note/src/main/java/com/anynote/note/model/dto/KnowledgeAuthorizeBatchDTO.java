package com.anynote.note.model.dto;

import com.anynote.note.constant.KnowledgeErrorConstants;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 复合实体键批量可读性请求（每批最多 100 条）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "复合实体键批量可读性请求")
public class KnowledgeAuthorizeBatchDTO {

    @NotEmpty(message = KnowledgeErrorConstants.INVALID_ENTITY)
    @Size(max = 100, message = KnowledgeErrorConstants.TOO_MANY)
    @Schema(description = "复合实体键列表，如 note:12 或 mooc_item:5#transcript")
    private List<@NotBlank(message = KnowledgeErrorConstants.INVALID_ENTITY) String> refs;
}
