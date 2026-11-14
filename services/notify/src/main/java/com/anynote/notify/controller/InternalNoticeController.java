package com.anynote.notify.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.notify.model.dto.KnowledgeNoticeBatchDTO;
import com.anynote.notify.model.dto.KnowledgeNoticeExportDTO;
import com.anynote.notify.model.vo.KnowledgeNoticeBatchVO;
import com.anynote.notify.model.vo.KnowledgeNoticeExportVO;
import com.anynote.notify.service.KnowledgeNoticeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 内部知识库通知访问端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "知识库通知（内部）", description = "供索引管线分页导出及批量读取知识库通知")
@RestController
@RequestMapping("/internal/v1/notices")
public class InternalNoticeController {

    private final KnowledgeNoticeService knowledgeNoticeService;

    /**
     * 构造内部知识库通知访问端点。
     *
     * @param knowledgeNoticeService 知识库通知导出服务
     */
    public InternalNoticeController(KnowledgeNoticeService knowledgeNoticeService) {
        this.knowledgeNoticeService = knowledgeNoticeService;
    }

    /**
     * 按主键游标分页导出有效知识库通知。
     *
     * @param request 游标与页大小参数
     * @return 导出分页结果
     */
    @InnerAuth
    @Operation(summary = "导出知识库通知", description = "按主键id游标分页导出有效知识库通知")
    @PostMapping("/export")
    public ResData<KnowledgeNoticeExportVO> export(@RequestBody(required = false) KnowledgeNoticeExportDTO request) {
        return ResUtil.success(knowledgeNoticeService.export(request));
    }

    /**
     * 按通知 id 批量读取有效知识库通知。
     *
     * @param request 通知 id 列表
     * @return 命中通知与失效缺失 id 列表
     */
    @InnerAuth
    @Operation(summary = "批量读取知识库通知", description = "按id批量返回有效知识库通知并报告已关闭或删除的id")
    @PostMapping("/batch")
    public ResData<KnowledgeNoticeBatchVO> getBatch(@RequestBody(required = false) KnowledgeNoticeBatchDTO request) {
        return ResUtil.success(knowledgeNoticeService.getBatch(request));
    }
}
