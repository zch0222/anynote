package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 统一知识源文档。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "统一知识源文档")
public class KnowledgeSourceDocumentVO {

    private String ref;
    private String entityType;
    private String subtype;
    private Long entityId;
    private Long kbId;
    private String parentRef;
    private String title;
    private String format;
    private String body;
    private String objectName;
    private String contentUrl;
    private Acl acl;
    private String authority;
    private String contentVersion;
    private String metaVersion;
    private Map<String, Object> attributes;
    private Date sourceCreatedAt;
    private Date sourceUpdatedAt;

    /**
     * 内容访问控制信息。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "内容访问控制信息")
    public static class Acl {
        private Long createBy;
        private String permissions;
        private Integer dataScope;
        @Schema(description = "任务成员用户 id（仅任务实体，含管理与提交权限）")
        private List<Long> taskMemberIds;
    }
}
