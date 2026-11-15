package com.anynote.ai.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 检索参数整体更新请求，全部字段必填。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "检索参数更新请求")
public class RetrievalSettingUpdateDTO {

    @NotNull(message = "请求参数错误")
    @Schema(description = "倒数排名融合常数（1–1000）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer rrfK;

    @NotNull(message = "请求参数错误")
    @Schema(description = "每个召回通道的候选数（10–200）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer channelCandidates;

    @NotNull(message = "请求参数错误")
    @Schema(description = "关键词型查询的全文权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double keywordLexicalWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "关键词型查询的语义权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double keywordSemanticWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "完整问句的全文权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double questionLexicalWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "完整问句的语义权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double questionSemanticWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "其余查询的全文权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double defaultLexicalWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "其余查询的语义权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double defaultSemanticWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "条目级通道权重（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double itemWeight;

    @NotNull(message = "请求参数错误")
    @Schema(description = "原始内容的权威性系数（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double authorityOriginal;

    @NotNull(message = "请求参数错误")
    @Schema(description = "转写内容的权威性系数（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double authorityTranscript;

    @NotNull(message = "请求参数错误")
    @Schema(description = "模型生成内容的权威性系数（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Double authorityGenerated;

    @NotNull(message = "请求参数错误")
    @Schema(description = "每个实体最多保留的片段数（1–10）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer maxChunksPerEntity;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_search 默认返回条数（1–50）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer searchDefaultLimit;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_search 最多返回条数（1–50）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer searchMaxLimit;

    @NotNull(message = "请求参数错误")
    @Schema(description = "相邻片段扩展的前后片数（0–3）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer neighborWindow;

    @NotNull(message = "请求参数错误")
    @Schema(description = "相邻扩展后的总字数上限（0–20000）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer neighborMaxChars;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_read 单次返回字数（500–20000）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer readMaxChars;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_grep 最多命中数（1–200）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer grepMaxHits;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_grep 默认上下文行数（0–5）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer grepContextDefault;

    @NotNull(message = "请求参数错误")
    @Schema(description = "kb_grep 最大上下文行数（0–10）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer grepContextMax;

    @NotNull(message = "请求参数错误")
    @Schema(description = "库范围 kb_grep 的候选实体数（1–50）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer grepKbCandidates;

    @NotNull(message = "请求参数错误")
    @Schema(description = "判定关键词型查询的短词长度（1–20）", requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer shortKeywordChars;

    @NotNull(message = "请求参数错误")
    @Schema(description = "是否启用重排", requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean rerankEnabled;
}
