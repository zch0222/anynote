package com.anynote.note.service;

import com.anynote.note.model.dto.KnowledgeQueryDTO;
import com.anynote.note.model.dto.KnowledgeStatsDTO;
import com.anynote.note.model.vo.KnowledgeQueryVO;
import com.anynote.note.model.vo.KnowledgeStatsVO;
import com.anynote.system.api.model.bo.LoginUser;

/**
 * 白名单结构化知识查询服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeQueryService {

    /**
     * 执行通用实体查询或命名任务查询。
     *
     * @param loginUser 用户身份
     * @param request 查询请求
     * @return 权限过滤后的行与计数
     */
    KnowledgeQueryVO query(LoginUser loginUser, KnowledgeQueryDTO request);

    /**
     * 统计检索范围内各知识库的直属可读内容数量。
     *
     * @param loginUser 用户身份
     * @param request 显式知识库范围，可为空
     * @return 各知识库的计数与最近更新时间
     */
    KnowledgeStatsVO stats(LoginUser loginUser, KnowledgeStatsDTO request);
}
