package com.anynote.note.model.po;

import lombok.Data;

/**
 * 任务已提交成员（{@code selectNoteTaskSubmitMembers} 的行）
 *
 * <p>独立于 {@link NoteTaskEditHeatmapPO}：窗口内一次都没编辑过的成员不会出现在逐日统计里，
 * 需要这份名单把这些成员补成 counts 全 0 的行。</p>
 *
 * @author 称霸幼儿园
 */
@Data
public class NoteTaskSubmitMemberPO {

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
}
