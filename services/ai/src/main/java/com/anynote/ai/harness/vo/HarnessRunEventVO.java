package com.anynote.ai.harness.vo;

import com.google.gson.JsonObject;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Python Harness 发来的运行事件信封；data 保留原始 JSON，由 Java 按事件类型解析成对应的数据类。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HarnessRunEventVO {

    /**
     * 本次运行内递增的事件序号。
     */
    private Long seq;

    /**
     * 运行标识。
     */
    private String runId;

    /**
     * 事件时间。
     */
    private String ts;

    /**
     * 事件类型。
     */
    private String type;

    /**
     * 事件数据的原始 JSON。
     */
    private JsonObject data;
}
