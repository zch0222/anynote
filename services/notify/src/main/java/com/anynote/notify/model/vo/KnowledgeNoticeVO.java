package com.anynote.notify.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;
import java.util.Map;

/**
 * 面向索引管线的知识库通知源文档视图。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识库通知源文档")
public class KnowledgeNoticeVO {

    private String ref;
    private String entityType;
    private String subtype;
    private Long entityId;
    private Long kbId;
    private String parentRef;
    private String title;
    private String format;
    private String body;
    private Acl acl;
    private String authority;
    private String contentVersion;
    private String metaVersion;
    private Map<String, Object> attributes;
    private Date sourceCreatedAt;
    private Date sourceUpdatedAt;

    /**
     * 通知访问控制信息。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "通知访问控制信息")
    public static class Acl {
        private Long createBy;
        private String permissions;
        private Integer dataScope;
    }
}
