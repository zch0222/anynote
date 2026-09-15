package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 任务成员编辑热力图的一行
 *
 * @author 称霸幼儿园
 */
@Schema(description = "任务成员编辑热力图行：一个成员在统计区间内逐日的编辑次数")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NoteTaskEditHeatmapMemberVO {

    @Schema(description = "成员用户id")
    private Long userId;

    @Schema(description = "成员用户名")
    private String username;

    @Schema(description = "成员昵称")
    private String nickname;

    @Schema(description = "成员提交的笔记id")
    private Long noteId;

    @Schema(description = "统计区间内的编辑总次数")
    private Integer total;

    @Schema(description = "与 days 等长的逐日编辑次数，未编辑的日期为 0")
    private List<Integer> counts;
}
