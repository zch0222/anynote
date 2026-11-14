package com.anynote.note.enums;

import java.util.Arrays;

/**
 * 资料文件索引状态。
 *
 * @author 称霸幼儿园
 */
public enum DocIndexStatus {
    /**
     * 索引成功。
     */
    INDEXED(0),

    /**
     * 正在索引。
     */
    INDEXING(1),

    /**
     * 索引失败。
     */
    FAILED(2),

    /**
     * 尚未索引。
     */
    NOT_INDEXED(3),

    /**
     * 无法提取文本内容（如扫描版 PDF）。
     */
    UNEXTRACTABLE(4);

    private final int value;

    DocIndexStatus(int value) {
        this.value = value;
    }

    /**
     * 获取持久化数值。
     *
     * @return 状态数值
     */
    public int getValue() {
        return this.value;
    }

    /**
     * 判断给定数值是否为合法索引状态。
     *
     * @param status 状态数值
     * @return 合法时返回 true
     */
    public static boolean contains(Integer status) {
        if (status == null) {
            return false;
        }
        return Arrays.stream(values()).anyMatch(item -> item.value == status);
    }
}
