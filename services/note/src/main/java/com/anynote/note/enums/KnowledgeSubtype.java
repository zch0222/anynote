package com.anynote.note.enums;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.constant.KnowledgeErrorConstants;

import java.util.Locale;

/**
 * 慕课条目附属内容类型。
 *
 * @author 称霸幼儿园
 */
public enum KnowledgeSubtype {
    TRANSCRIPT("transcript"),
    SUMMARY("summary");

    private final String value;

    KnowledgeSubtype(String value) {
        this.value = value;
    }

    /**
     * 获取接口使用的附属类型值。
     *
     * @return 附属类型值
     */
    public String getValue() {
        return value;
    }

    /**
     * 解析附属内容类型。
     *
     * @param value 附属类型字符串，可为空
     * @return 附属类型或 null
     */
    public static KnowledgeSubtype parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        for (KnowledgeSubtype subtype : values()) {
            if (subtype.value.equals(value.toLowerCase(Locale.ROOT))) {
                return subtype;
            }
        }
        throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    /**
     * 获取附属类型对应的实体类型。
     *
     * @return 实体类型
     */
    public KnowledgeEntityType entityType() {
        return this == TRANSCRIPT ? KnowledgeEntityType.TRANSCRIPT : KnowledgeEntityType.SUMMARY;
    }
}
