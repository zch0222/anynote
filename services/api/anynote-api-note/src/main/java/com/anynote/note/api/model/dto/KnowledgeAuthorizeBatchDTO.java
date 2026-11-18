package com.anynote.note.api.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

    @Valid
    @NotBlank(message = "请求参数错误")
    @Schema(description = "待判定实体列表，如 note:12 或 mooc_item:5#transcript")
    private List<String> refs;
}
