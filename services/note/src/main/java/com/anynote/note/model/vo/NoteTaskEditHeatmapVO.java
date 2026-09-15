package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 任务成员编辑热力图
 *
 * <p>按天统计已提交成员在任务时间窗口内对提交笔记的编辑次数，供任务详情页的「成员编辑活跃度」卡片使用。
 * 与旧的 {@code GET /noteTasks/{id}/charts} 的区别：一条 SQL 按天聚合、区间限定在任务窗口内、无提交时返回空列表。</p>
 *
 * @author 称霸幼儿园
 */
@Schema(description = "任务成员编辑热力图")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NoteTaskEditHeatmapVO {

    @Schema(description = "任务开始日（yyyy-MM-dd）")
    private String startDate;

    @Schema(description = "任务截止日（yyyy-MM-dd）")
    private String endDate;

    @Schema(description = "服务端当天（yyyy-MM-dd）；前端据此把之后的列画成「未到」")
    private String today;

    @Schema(description = "统计区间内的逐日日期（yyyy-MM-dd）；区间超过 62 天时只取截至 min(endDate, today) 的最后 62 天")
    private List<String> days;

    @Schema(description = "成员编辑次数矩阵，只含状态正常的提交，按 total 降序")
    private List<NoteTaskEditHeatmapMemberVO> members;
}
