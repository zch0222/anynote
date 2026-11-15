package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 检索参数视图，供管理接口与内部模型快照使用。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "检索参数")
public class RetrievalSettingVO {

    @Schema(description = "倒数排名融合常数（1–1000）")
    private Integer rrfK;
    @Schema(description = "每个召回通道的候选数（10–200）")
    private Integer channelCandidates;
    @Schema(description = "关键词型查询的全文权重（0–5）")
    private Double keywordLexicalWeight;
    @Schema(description = "关键词型查询的语义权重（0–5）")
    private Double keywordSemanticWeight;
    @Schema(description = "完整问句的全文权重（0–5）")
    private Double questionLexicalWeight;
    @Schema(description = "完整问句的语义权重（0–5）")
    private Double questionSemanticWeight;
    @Schema(description = "其余查询的全文权重（0–5）")
    private Double defaultLexicalWeight;
    @Schema(description = "其余查询的语义权重（0–5）")
    private Double defaultSemanticWeight;
    @Schema(description = "条目级通道权重（0–5）")
    private Double itemWeight;
    @Schema(description = "原始内容的权威性系数（0–5）")
    private Double authorityOriginal;
    @Schema(description = "转写内容的权威性系数（0–5）")
    private Double authorityTranscript;
    @Schema(description = "模型生成内容的权威性系数（0–5）")
    private Double authorityGenerated;
    @Schema(description = "每个实体最多保留的片段数（1–10）")
    private Integer maxChunksPerEntity;
    @Schema(description = "kb_search 默认返回条数（1–50）")
    private Integer searchDefaultLimit;
    @Schema(description = "kb_search 最多返回条数（1–50）")
    private Integer searchMaxLimit;
    @Schema(description = "相邻片段扩展的前后片数（0–3）")
    private Integer neighborWindow;
    @Schema(description = "相邻扩展后的总字数上限（0–20000）")
    private Integer neighborMaxChars;
    @Schema(description = "kb_read 单次返回字数（500–20000）")
    private Integer readMaxChars;
    @Schema(description = "kb_grep 最多命中数（1–200）")
    private Integer grepMaxHits;
    @Schema(description = "kb_grep 默认上下文行数（0–5）")
    private Integer grepContextDefault;
    @Schema(description = "kb_grep 最大上下文行数（0–10）")
    private Integer grepContextMax;
    @Schema(description = "库范围 kb_grep 的候选实体数（1–50）")
    private Integer grepKbCandidates;
    @Schema(description = "判定关键词型查询的短词长度（1–20）")
    private Integer shortKeywordChars;
    @Schema(description = "是否启用重排")
    private Boolean rerankEnabled;
    @Schema(description = "配置版本号，未保存过时为 0")
    private Long version;
    @Schema(description = "最近更新时间，未保存过时为空")
    private Date updateTime;
}
