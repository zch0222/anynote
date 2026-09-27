package com.anynote.note.model.po;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 笔记协同状态（{@code n_note_collab_state}）。
 *
 * <p>保存协同房间的 Yjs 全量状态及其对应的笔记版本号，只用于协同服务重启后恢复同一谱系的状态，
 * 不是正文的真相源。</p>
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NoteCollabState {

    /** 笔记id */
    private Long noteId;

    /** {@code Y.encodeStateAsUpdate} 的全量状态 */
    private byte[] state;

    /** 该状态对应的笔记版本号 */
    private String mdVersion;

    /** 状态谱系标识 */
    private String epoch;

    /** 更新时间 */
    private Date updateTime;
}
