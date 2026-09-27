package com.anynote.note.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.model.dto.CollabSnapshotSaveDTO;
import com.anynote.note.model.vo.CollabSnapshotVO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.anynote.note.service.NoteCollabService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 笔记协同快照（内部端点）。
 *
 * <p>只供协同服务在容器网络内直连调用，请求必须带 {@code @InnerAuth} 规定的内部签名头；
 * 网关会剥掉外部请求的 {@code from-source}，因此这两个端点无法经网关从外部访问。</p>
 *
 * @author 称霸幼儿园
 */
@Tag(name = "笔记协同（内部）", description = "协同服务读取与写回笔记快照的内部端点")
@RestController
@RequestMapping("/notes")
@Validated
public class NoteCollabController {

    @Autowired
    private NoteCollabService noteCollabService;

    @InnerAuth
    @Operation(summary = "读取笔记协同快照（内部）",
            description = "仅协同服务调用。返回标题、正文、版本号，以及与之对应的 Y.Doc 状态（可能过期或为空）；"
                    + "笔记不存在返回 A0404")
    @GetMapping("{noteId}/collab-snapshot")
    public ResData<CollabSnapshotVO> getCollabSnapshot(
            @Parameter(description = "笔记id", required = true)
            @NotNull(message = "笔记id不能为空") @PathVariable Long noteId) {
        return ResUtil.success(noteCollabService.getSnapshot(noteId));
    }

    @InnerAuth
    @Operation(summary = "写回笔记协同快照（内部）",
            description = "仅协同服务调用。按 baseVersion 原子比较，版本过期返回 A0409；"
                    + "成功时在同一事务里写标题、正文与 Y.Doc 状态，并照常触发索引与编辑日志消息；"
                    + "笔记不存在返回 A0404")
    @PutMapping("{noteId}/collab-snapshot")
    public ResData<NoteSaveResultVO> saveCollabSnapshot(
            @Parameter(description = "笔记id", required = true)
            @NotNull(message = "笔记id不能为空") @PathVariable Long noteId,
            @Validated @RequestBody CollabSnapshotSaveDTO dto) {
        return ResUtil.success(noteCollabService.saveSnapshot(noteId, dto));
    }
}
