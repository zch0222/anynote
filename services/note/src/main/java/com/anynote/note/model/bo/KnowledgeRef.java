package com.anynote.note.model.bo;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeSubtype;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 知识实体引用。
 *
 * @author 称霸幼儿园
 */
@Getter
@AllArgsConstructor
public class KnowledgeRef {

    private final KnowledgeEntityType type;
    private final Long id;

    /**
     * 解析资源标识与附属类型。
     *
     * @param ref 基础资源标识
     * @param subtype 附属类型
     * @return 知识实体引用
     */
    public static KnowledgeRef parse(String ref, String subtype) {
        if (ref == null) {
            throw invalid();
        }
        int separator = ref.indexOf(':');
        if (separator <= 0 || separator != ref.lastIndexOf(':') || separator == ref.length() - 1) {
            throw invalid();
        }
        KnowledgeEntityType baseType = KnowledgeEntityType.parseRefPrefix(ref.substring(0, separator));
        final long id;
        try {
            id = Long.parseLong(ref.substring(separator + 1));
        } catch (NumberFormatException e) {
            throw invalid();
        }
        if (id <= 0) {
            throw invalid();
        }
        KnowledgeSubtype parsedSubtype = KnowledgeSubtype.parse(subtype);
        if (parsedSubtype != null && baseType != KnowledgeEntityType.MOOC_ITEM) {
            throw invalid();
        }
        return new KnowledgeRef(parsedSubtype == null ? baseType : parsedSubtype.entityType(), id);
    }

    /**
     * 解析复合引用字符串，支持 {@code note:1} 与 {@code mooc_item:5#transcript} 形式。
     *
     * @param combinedRef 复合引用字符串
     * @return 知识实体引用
     */
    public static KnowledgeRef parseCombined(String combinedRef) {
        if (combinedRef == null || combinedRef.isBlank()) {
            throw invalid();
        }
        int hashIndex = combinedRef.indexOf('#');
        if (hashIndex < 0) {
            return parse(combinedRef, null);
        }
        if (hashIndex == 0 || hashIndex != combinedRef.lastIndexOf('#') || hashIndex == combinedRef.length() - 1) {
            throw invalid();
        }
        return parse(combinedRef.substring(0, hashIndex), combinedRef.substring(hashIndex + 1));
    }

    /**
     * 创建指定类型的引用。
     *
     * @param type 实体类型
     * @param id 实体 id
     * @return 知识实体引用
     */
    public static KnowledgeRef of(KnowledgeEntityType type, Long id) {
        if (type == null || id == null || id <= 0) {
            throw invalid();
        }
        return new KnowledgeRef(type, id);
    }

    /**
     * 获取基础实体资源标识。
     *
     * @return 资源标识
     */
    public String ref() {
        return type.getRefPrefix() + ":" + id;
    }

    /**
     * 获取附属内容类型。
     *
     * @return 字幕或视频总结类型，基础实体返回 null
     */
    public String subtype() {
        return type.isMoocItemSubtype() ? type.getValue() : null;
    }

    /**
     * 获取基础实体类型。
     *
     * @return 附属内容返回慕课条目，其余返回自身类型
     */
    public KnowledgeEntityType baseType() {
        return type.isMoocItemSubtype() ? KnowledgeEntityType.MOOC_ITEM : type;
    }

    private static BusinessException invalid() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
