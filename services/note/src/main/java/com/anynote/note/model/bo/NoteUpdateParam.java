package com.anynote.note.model.bo;

import com.anynote.note.model.dto.NoteEditDTO;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Note更新参数
 * @author 称霸幼儿园
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NoteUpdateParam extends NoteQueryParam{

    /**
     * 正文
     */
    private String content;

    private Integer dataScope;

    private String permissions;

    private Integer deleted;

    private Long contentId;

    /**
     * 本次编辑所基于的版本号，为空表示不做冲突检测
     */
    private String version;

    /**
     * 写入时的比较条件：只有 {@code update_time} 仍等于它时才更新，为空表示不比较
     */
    private java.util.Date baseUpdateTime;

    public NoteUpdateParam(NoteEditDTO noteEditDTO) {
        this.setId(noteEditDTO.getNoteId());
        this.setTitle(noteEditDTO.getTitle());
        this.content = noteEditDTO.getContent();
        this.version = noteEditDTO.getVersion();
        this.setKnowledgeBaseId(noteEditDTO.getKnowledgeBaseId());
    }
}
