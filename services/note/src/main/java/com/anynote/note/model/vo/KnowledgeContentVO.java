package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 权威正文范围读取结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "权威正文范围读取结果")
public class KnowledgeContentVO {

    private String ref;
    private String entityType;
    private String subtype;
    private Long kbId;
    private String title;
    private String format;
    private String authority;
    private String contentVersion;
    private String metaVersion;
    private String content;
    private boolean truncated;
    private Integer nextOffset;
}
