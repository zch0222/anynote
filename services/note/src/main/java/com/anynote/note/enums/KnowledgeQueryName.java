package com.anynote.note.enums;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.constant.KnowledgeErrorConstants;

/**
 * 结构化命名查询。
 *
 * @author 称霸幼儿园
 */
public enum KnowledgeQueryName {
    MY_TASKS;

    /**
     * 解析命名查询。
     *
     * @param value 查询名称，可为空
     * @return 命名查询或 null
     */
    public static KnowledgeQueryName parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_QUERY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }
}
