package com.anynote.note.api.model.dto;

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
 * 服务间批量可读性请求（每批最多 100 条）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "服务间批量可读性请求")
public class KnowledgeAuthorizeBatchDTO {

    @NotEmpty(message = "知识实体参数不合法")
    @Size(max = 100, message = "单次请求数量超出限制")
    @Schema(description = "待判定实体列表，如 note:12 或 mooc_item:5#transcript")
    private List<@NotBlank(message = "知识实体参数不合法") String> refs;
}
