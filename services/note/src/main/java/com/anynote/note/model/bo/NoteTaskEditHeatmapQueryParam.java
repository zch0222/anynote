package com.anynote.note.model.bo;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 任务成员编辑热力图查询参数
 *
 * <p>继承 {@link NoteTaskQueryParam} 是为了让 {@code RequiresNoteTaskPermissionsAspect}
 * 能像 charts / operationCounts 那样从第一个入参取出 noteTaskId 做任务权限校验。
 * {@code rangeStart} / {@code rangeEnd} 由 Service 按任务时间窗口算出后再传给 Mapper。</p>
 *
 * @author 称霸幼儿园
 */
@EqualsAndHashCode(callSuper = true)
@Data
@NoArgsConstructor
public class NoteTaskEditHeatmapQueryParam extends NoteTaskQueryParam {

    /**
     * 统计区间开始（含）
     */
    private Date rangeStart;

    /**
     * 统计区间结束（不含）
     */
    private Date rangeEnd;

    public NoteTaskEditHeatmapQueryParam(Long noteTaskId, Date rangeStart, Date rangeEnd) {
        this.setNoteTaskId(noteTaskId);
        this.rangeStart = rangeStart;
        this.rangeEnd = rangeEnd;
    }
}
