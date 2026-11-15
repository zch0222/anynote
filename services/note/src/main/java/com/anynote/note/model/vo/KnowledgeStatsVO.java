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
 * 知识库内容统计。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "知识库内容统计")
public class KnowledgeStatsVO {

    @Schema(description = "各知识库的统计，顺序与检索范围一致")
    private List<KnowledgeBaseStats> knowledgeBases;

    /**
     * 单个知识库的可读内容统计。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "单个知识库的可读内容统计")
    public static class KnowledgeBaseStats {
        @Schema(description = "知识库ID")
        private Long kbId;
        @Schema(description = "知识库名称")
        private String name;
        @Schema(description = "当前用户在该库的角色")
        private String role;
        @Schema(description = "各类直属内容的可读数量，键为 note、doc、mooc、task")
        private Map<String, Long> counts;
        @Schema(description = "计入条目中最晚的更新时间，没有条目时为空")
        private Date latestUpdateTime;
    }
}
