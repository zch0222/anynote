package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 笔记保存结果
 *
 * <p>保存成功后回传服务端权威状态，前端据此结束乐观更新并把 {@code version} 带入下一次保存做冲突检测。</p>
 *
 * @author 称霸幼儿园
 */
@Schema(description = "笔记保存结果")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NoteSaveResultVO {

    @Schema(description = "笔记id")
    private Long id;

    @Schema(description = "保存后的笔记标题")
    private String title;

    @Schema(description = "保存后的笔记正文")
    private String content;

    @Schema(description = "服务端记录的最后更新时间")
    private Date updateTime;

    @Schema(description = "乐观并发版本号，取 updateTime 的毫秒时间戳字符串；下次保存原样回传即可检测冲突")
    private String version;
}
