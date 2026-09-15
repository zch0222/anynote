package com.anynote.note.model.po;

import lombok.Data;

import java.util.Date;

/**
 * 任务成员逐日编辑次数（{@code selectNoteTaskEditHeatmap} 的行）
 *
 * @author 称霸幼儿园
 */
@Data
public class NoteTaskEditHeatmapPO {

    /**
     * 用户id
     */
    private Long userId;

    /**
     * 用户名
     */
    private String username;

    /**
     * 昵称
     */
    private String nickname;

    /**
     * 提交的笔记id
     */
    private Long noteId;

    /**
     * 编辑日期（按天聚合）
     */
    private Date editDate;

    /**
     * 当天的编辑次数
     */
    private Integer editCount;
}
