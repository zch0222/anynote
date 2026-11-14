package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单个实体可读性结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "单个实体可读性结果")
public class KnowledgeAuthorizationItemVO {

    private String ref;
    private String subtype;
    private boolean readable;
    private String permissionBasis;
    private Long kbId;
    private String contentVersion;
    private String metaVersion;
}
