package com.anynote.notify.service;

import com.anynote.notify.model.dto.KnowledgeNoticeBatchDTO;
import com.anynote.notify.model.dto.KnowledgeNoticeExportDTO;
import com.anynote.notify.model.vo.KnowledgeNoticeBatchVO;
import com.anynote.notify.model.vo.KnowledgeNoticeExportVO;

/**
 * 面向索引管线的知识库通知导出服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeNoticeService {

    /**
     * 按主键游标导出有效知识库通知。
     *
     * @param request 游标与页大小参数
     * @return 导出分页结果
     */
    KnowledgeNoticeExportVO export(KnowledgeNoticeExportDTO request);

    /**
     * 按通知 id 批量读取有效知识库通知。
     *
     * @param request 通知 id 列表
     * @return 命中文档与缺失或已失效的 id 列表
     */
    KnowledgeNoticeBatchVO getBatch(KnowledgeNoticeBatchDTO request);
}
