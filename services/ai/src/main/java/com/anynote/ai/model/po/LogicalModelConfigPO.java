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
 * 运行时逻辑模型绑定持久化实体（agent_main、fast、embedding）。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_logical_model")
public class LogicalModelConfigPO {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String logicalName;
    private String providerKey;
    private String modelName;
    private Integer dimensions;
    private String reasoningFormat;
    private String reasoningPassthrough;
    private Integer supportsVision;
    private Integer enabled;
    private Long version;
    private Long createBy;
    private Long updateBy;
    private Date createTime;
    private Date updateTime;
}
