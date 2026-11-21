package com.anynote.ai.harness.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Python Harness 的 trace.dependencies 事件数据：本次运行模型看到过的全部实体键。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HarnessTraceDependenciesVO {

    /**
     * 实体键，如 note:12 或 mooc_item:5#transcript。
     */
    @Builder.Default
    private List<String> dependencies = new ArrayList<>();
}
