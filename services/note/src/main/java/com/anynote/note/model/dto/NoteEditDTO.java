package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 笔记编辑传输类
 * @author 称霸幼儿园
 */
@Schema(description = "笔记编辑参数")
@Data
@AllArgsConstructor
@NoArgsConstructor
public class NoteEditDTO {

    @Schema(description = "笔记id，由路径参数覆盖，请求体无需携带")
    private Long noteId;

    @Schema(description = "笔记标题，为空表示不修改标题")
    private String title;

    @Schema(description = "笔记正文，为空表示不修改正文")
    private String content;

    @Schema(description = "目标知识库id；与当前归属不同即表示移动笔记，需要对目标知识库有编辑权限")
    private Long knowledgeBaseId;

    @Schema(description = "本次编辑所基于的版本号（上一次读取或保存返回的 version）；"
            + "省略表示放弃冲突检测，按后写入者胜出处理。与服务端当前版本不一致时返回 A0409")
    private String version;
}
