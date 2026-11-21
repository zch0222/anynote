package com.anynote.ai.model.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 运行开始时的索引状态快照：Worker 状态与白名单水位字段。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "索引状态快照")
public class AgentIndexWatermarkVO {

    @Schema(description = "Worker 状态：ok、unhealthy 或 unavailable")
    private String status;

    @Schema(description = "索引水位")
    private Fields watermark;

    /**
     * 索引水位字段。
     *
     * @author 称霸幼儿园
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "AgentIndexWatermarkFields", description = "索引水位字段")
    public static class Fields {

        @Schema(description = "已处理游标")
        private Long processedCursor;

        @Schema(description = "最新游标")
        private Long latestCursor;

        @Schema(description = "积压条数")
        private Long lagRecords;

        @Schema(description = "最近处理时间")
        private String lastProcessedAt;

        @Schema(description = "最近成功时间")
        private String lastSuccessAt;

        @Schema(description = "最近错误类型")
        private String lastErrorType;

        @Schema(description = "切块规则版本")
        private String chunkerVersion;

        @Schema(description = "向量化规则版本")
        private String embeddingProfileVersion;
    }
}
