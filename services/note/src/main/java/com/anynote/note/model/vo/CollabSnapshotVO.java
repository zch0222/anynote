package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 笔记协同快照（{@code GET /notes/{noteId}/collab-snapshot}）。
 *
 * <p>协同服务开房时读取：正文与版本号是真相源；{@code state} 是上次写回时存下的 Y.Doc 状态，
 * {@code stateVersion} 与 {@code version} 不一致表示此后发生过外部写入。</p>
 *
 * @author 称霸幼儿园
 */
@Schema(description = "笔记协同快照（内部）")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollabSnapshotVO {

    @Schema(description = "笔记id")
    private Long noteId;

    @Schema(description = "笔记标题")
    private String title;

    @Schema(description = "笔记正文 Markdown")
    private String content;

    @Schema(description = "当前版本号，取 updateTime 的毫秒时间戳")
    private String version;

    @Schema(description = "上次写回的 Y.Doc 全量状态，Base64 编码；从未写回过时为 null")
    private String state;

    @Schema(description = "state 对应的笔记版本号；与 version 不同表示此后发生过外部写入。state 为 null 时为 null")
    private String stateVersion;

    @Schema(description = "state 的谱系标识（UUID）。state 为 null 时为 null")
    private String epoch;
}
