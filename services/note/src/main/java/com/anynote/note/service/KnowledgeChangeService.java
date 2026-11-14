package com.anynote.note.service;

import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.model.vo.KnowledgeChangePageVO;

/**
 * 知识变更记录服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeChangeService {

    /**
     * 在当前业务事务中插入变更记录。
     *
     * @param entityType 实体类型
     * @param entityId 基础实体 id
     * @param knowledgeBaseId 所属知识库 id
     * @param operation 变更操作
     * @return 变更游标 id
     */
    Long record(KnowledgeEntityType entityType, Long entityId, Long knowledgeBaseId, KnowledgeOperation operation);

    /**
     * 按游标读取变更。
     *
     * @param afterId 上一页游标
     * @param limit 页大小
     * @return 变更分页结果
     */
    KnowledgeChangePageVO changes(long afterId, int limit);

    /**
     * 回写资料索引状态。
     *
     * @param docId 资料 id
     * @param status 索引状态
     */
    void updateDocIndexStatus(Long docId, Integer status);

    /**
     * 登记最新视频总结变更。
     *
     * @param moocItemId 慕课条目 id
     * @return 变更游标 id
     */
    Long recordSummaryChange(Long moocItemId);
}
