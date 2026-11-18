package com.anynote.note.api.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 服务间批量可读性响应。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "服务间批量可读性响应")
public class KnowledgeAuthorizeBatchVO {

    @Schema(description = "当前用户可读的实体键列表")
    private List<String> readable;
}
