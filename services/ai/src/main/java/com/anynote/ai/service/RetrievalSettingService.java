package com.anynote.ai.service;

import com.anynote.ai.model.dto.RetrievalSettingUpdateDTO;
import com.anynote.ai.model.vo.RetrievalSettingVO;

/**
 * 知识检索运行参数服务。
 *
 * @author 称霸幼儿园
 */
public interface RetrievalSettingService {

    /**
     * 读取当前检索参数，未保存过时返回默认值。
     *
     * @return 当前参数
     */
    RetrievalSettingVO get();

    /**
     * 校验并整体保存检索参数。
     *
     * @param request 更新请求
     * @param operatorId 操作管理员用户 id
     * @return 保存后的参数
     */
    RetrievalSettingVO update(RetrievalSettingUpdateDTO request, Long operatorId);
}
