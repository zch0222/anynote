package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 笔记协同准入结果（`GET /notes/{noteId}/collab-grant`）。
 *
 * <p>BFF 用它决定是否为当前会话签发协同令牌、令牌里的房间与只读标志怎么填。
 * 因此它是**轻量**的：只回权限、版本与标题，不回正文——正文由客户端另行
 * `GET /notes/{noteId}` 取，两条链路互不耦合。</p>
 *
 * <p>无权限时 {@code perm} 为 {@code NONE} 而**不抛 401**：区分「没登录」与
 * 「登录了但没权限」是 BFF 的职责，这里只如实回权限值。</p>
 *
 * <p>此时 {@code title} 与 {@code version} 一律为 {@code null}：端点不挂
 * {@code @RequiresNotePermissions}，任何登录用户都能按 id 调用，回这两个字段
 * 等于给出一份可枚举的全站笔记标题与最后修改时间清单。</p>
 *
 * @author 称霸幼儿园
 */
@Schema(description = "笔记协同准入结果")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollabGrantVO {

    @Schema(description = "笔记id")
    private Long noteId;

    @Schema(description = "当前用户对该笔记的权限：MANAGE / EDIT / READ / NONE")
    private String perm;

    @Schema(description = "当前版本令牌，取 updateTime 的毫秒时间戳；与 PATCH /notes/{noteId} 的版本同源，供客户端首拍保存使用。perm 为 NONE 时为 null")
    private String version;

    @Schema(description = "笔记标题，供协同页头部展示。perm 为 NONE 时为 null，避免无权限者据此枚举全站笔记标题")
    private String title;
}
