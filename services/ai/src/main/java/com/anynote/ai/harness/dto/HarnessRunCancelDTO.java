package com.anynote.ai.harness.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Harness 取消运行的结果数据。
 *
 * @author 称霸幼儿园
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HarnessRunCancelDTO {

    private String runId;

    private boolean accepted;

    private String state;
}
