package com.anynote.note.service;

import com.anynote.note.model.dto.KnowledgeOutlineDTO;
import com.anynote.note.model.vo.KnowledgeOutlineVO;
import com.anynote.system.api.model.bo.LoginUser;

/**
 * 知识目录与 Markdown 大纲服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeOutlineService {

    /**
     * 读取用户可读的目录或大纲。
     *
     * @param loginUser 用户身份
     * @param request 目录请求
     * @return 分页节点
     */
    KnowledgeOutlineVO outline(LoginUser loginUser, KnowledgeOutlineDTO request);
}
