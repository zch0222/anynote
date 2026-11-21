package com.anynote.ai.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * heartbeat 事件数据：空对象，只用于保持连接。
 *
 * @author 称霸幼儿园
 */
@Data
@Schema(description = "heartbeat 事件数据")
public class AgentHeartbeatEventVO {
}
