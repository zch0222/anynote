package com.anynote.note.service;

import com.anynote.note.model.dto.KnowledgeContentDTO;
import com.anynote.note.model.vo.KnowledgeContentVO;
import com.anynote.system.api.model.bo.LoginUser;

/**
 * 权威正文范围读取服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeContentService {

    /**
     * 读取用户可读的实体正文片段。
     *
     * @param loginUser 用户身份
     * @param request 范围读取请求
     * @return 正文及续读位置
     */
    KnowledgeContentVO read(LoginUser loginUser, KnowledgeContentDTO request);
}
