package com.anynote.note.service;

import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;

/**
 * 知识权威实体读取与导出。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeEntityService {

    /**
     * 读取一个源文档。
     *
     * @param ref 实体引用
     * @param includeBody 是否读取正文
     * @return 源文档，不存在时返回 null
     */
    KnowledgeSourceDocumentVO get(KnowledgeRef ref, boolean includeBody);

    /**
     * 按实体类型和游标导出源文档。
     *
     * @param entityType 实体类型
     * @param kbId 知识库 id，可为空
     * @param afterId 上一页最后扫描 id
     * @param limit 本轮扫描上限
     * @return 导出分页结果
     */
    KnowledgeExportVO export(String entityType, Long kbId, Long afterId, int limit);

    /**
     * 分页读取源文档元数据或正文。
     *
     * @param entityType 实体类型
     * @param kbId 知识库 id
     * @param afterId 上一页最后扫描 id
     * @param limit 本轮扫描上限
     * @param includeBody 是否读取正文
     * @return 源文档分页结果
     */
    KnowledgeExportVO page(String entityType, Long kbId, Long afterId, int limit, boolean includeBody);
}
