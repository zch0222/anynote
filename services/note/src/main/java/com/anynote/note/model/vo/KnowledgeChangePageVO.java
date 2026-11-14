package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;
import java.util.List;

/**
 * 知识变更游标分页结果。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识变更游标分页结果")
public class KnowledgeChangePageVO {

    private List<Change> changes;
    private Long nextCursor;
    private Long latestCursor;

    /**
     * 知识变更记录。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "知识变更记录")
    public static class Change {
        private Long id;
        private String entityType;
        private Long entityId;
        private Long kbId;
        private String operation;
        private Date createTime;
    }
}
