package com.anynote.ai.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 检索参数持久化实体（单行表）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_retrieval_setting")
public class RetrievalSettingPO {

    @TableId(type = IdType.INPUT)
    private Long id;
    private Integer rrfK;
    private Integer channelCandidates;
    private Double keywordLexicalWeight;
    private Double keywordSemanticWeight;
    private Double questionLexicalWeight;
    private Double questionSemanticWeight;
    private Double defaultLexicalWeight;
    private Double defaultSemanticWeight;
    private Double itemWeight;
    private Double authorityOriginal;
    private Double authorityTranscript;
    private Double authorityGenerated;
    private Integer maxChunksPerEntity;
    private Integer searchDefaultLimit;
    private Integer searchMaxLimit;
    private Integer neighborWindow;
    private Integer neighborMaxChars;
    private Integer readMaxChars;
    private Integer grepMaxHits;
    private Integer grepContextDefault;
    private Integer grepContextMax;
    private Integer grepKbCandidates;
    private Integer shortKeywordChars;
    private Integer rerankEnabled;
    private Long version;
    private Long createBy;
    private Long updateBy;
    private Date createTime;
    private Date updateTime;
}
