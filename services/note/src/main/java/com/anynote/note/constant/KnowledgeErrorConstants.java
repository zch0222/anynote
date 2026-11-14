package com.anynote.note.constant;

/**
 * 知识访问层错误文案。
 *
 * @author 称霸幼儿园
 */
public final class KnowledgeErrorConstants {

    public static final String INVALID_ENTITY = "知识实体参数不合法";
    public static final String NOT_READABLE = "知识内容不存在或不可读";
    public static final String INVALID_CONTENT_RANGE = "正文读取范围不合法";
    public static final String INVALID_QUERY = "结构化查询参数不合法";
    public static final String TOO_MANY = "单次请求数量超出限制";
    public static final String INVALID_INDEX_STATUS = "资料索引状态不合法";
    public static final String READ_TRANSCRIPT_FAILED = "读取字幕失败";
    public static final String READ_SUMMARY_FAILED = "读取视频总结失败";
    public static final String READ_FILE_FAILED = "获取文件信息失败";

    private KnowledgeErrorConstants() {
    }
}
