package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 资料索引状态回写请求。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "资料索引状态回写请求")
public class KnowledgeIndexStatusDTO {

    @Schema(description = "索引状态：0已索引、1索引中、2失败、3未索引", allowableValues = {"0", "1", "2", "3"})
    private Integer status;
}
