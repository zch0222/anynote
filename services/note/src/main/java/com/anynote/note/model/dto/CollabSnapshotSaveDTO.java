package com.anynote.note.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * 协同服务写回笔记快照的请求体（{@code PUT /notes/{noteId}/collab-snapshot}）。
 *
 * @author 称霸幼儿园
 */
@Schema(description = "协同快照写回参数（内部）")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CollabSnapshotSaveDTO {

    @Schema(description = "笔记标题（取自正文顶部 H1），为空表示不修改标题；最长 80 字", maxLength = 80)
    @Size(max = 80, message = "标题不能超过 80 字")
    private String title;

    @Schema(description = "笔记正文 Markdown", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "正文不能为空")
    @ToString.Exclude
    private String content;

    @Schema(description = "与正文对应的 Y.Doc 全量状态（Y.encodeStateAsUpdate），Base64 编码",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "协同状态不能为空")
    @ToString.Exclude
    private String state;

    @Schema(description = "协同状态的谱系标识（UUID）", requiredMode = Schema.RequiredMode.REQUIRED,
            minLength = 36, maxLength = 36)
    @NotBlank(message = "谱系标识不能为空")
    @Size(min = 36, max = 36, message = "谱系标识必须是 36 位 UUID")
    private String epoch;

    @Schema(description = "本次写入所基于的版本号（上一次读取或写回返回的 version）；与服务端当前版本不一致时返回 A0409",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "基准版本号不能为空")
    @Pattern(regexp = "^[0-9]{1,19}$", message = "基准版本号格式错误")
    private String baseVersion;

    @Schema(description = "最近一次在协同房间里编辑的用户id；为空表示本次写入只包含外部写入的合并，沿用笔记的最后更新者")
    private Long operatorId;
}
