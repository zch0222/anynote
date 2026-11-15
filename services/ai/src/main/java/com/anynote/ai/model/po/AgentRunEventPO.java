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
 * Agent 运行事件与 Trace 记录。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_agent_run_event")
public class AgentRunEventPO {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String runId;

    private Long seq;

    private String type;

    private String content;

    private Date createTime;
}
