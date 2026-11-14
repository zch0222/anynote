package com.anynote.note.enums;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.constant.KnowledgeErrorConstants;

import java.util.Locale;

/**
 * 知识实体类型。
 *
 * @author 称霸幼儿园
 */
public enum KnowledgeEntityType {
    KNOWLEDGE_BASE("kb", "kb"),
    NOTE("note", "note"),
    DOC("doc", "doc"),
    MOOC("mooc", "mooc"),
    MOOC_ITEM("mooc_item", "mooc_item"),
    TRANSCRIPT("transcript", "mooc_item"),
    SUMMARY("summary", "mooc_item"),
    TASK("task", "task"),
    NOTICE("notice", "notice");

    private final String value;
    private final String refPrefix;

    KnowledgeEntityType(String value, String refPrefix) {
        this.value = value;
        this.refPrefix = refPrefix;
    }

    /**
     * 获取接口使用的实体类型值。
     *
     * @return 实体类型值
     */
    public String getValue() {
        return value;
    }

    /**
     * 获取资源标识前缀。
     *
     * @return 资源标识前缀
     */
    public String getRefPrefix() {
        return refPrefix;
    }

    /**
     * 解析实体类型。
     *
     * @param value 实体类型字符串
     * @return 实体类型
     */
    public static KnowledgeEntityType parse(String value) {
        if (value != null) {
            String normalized = value.toLowerCase(Locale.ROOT);
            for (KnowledgeEntityType type : values()) {
                if (type.value.equals(normalized)) {
                    return type;
                }
            }
        }
        throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    /**
     * 解析基础资源标识前缀。
     *
     * @param value 资源标识前缀
     * @return 基础实体类型
     */
    public static KnowledgeEntityType parseRefPrefix(String value) {
        for (KnowledgeEntityType type : values()) {
            if (type.refPrefix.equals(value) && (type != TRANSCRIPT && type != SUMMARY)) {
                return type;
            }
        }
        throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    /**
     * 判断是否为慕课条目的附属内容类型。
     *
     * @return 字幕或视频总结时返回 true
     */
    public boolean isMoocItemSubtype() {
        return this == TRANSCRIPT || this == SUMMARY;
    }
}
