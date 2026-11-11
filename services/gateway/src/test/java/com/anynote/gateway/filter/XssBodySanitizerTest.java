package com.anynote.gateway.filter;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link XssBodySanitizer}：按字段分层的请求体过滤规则。
 *
 * 守住两件事：
 * - Markdown 文本字段（`content` / `title`）原样放行，`>` / `<` 不被实体转义（UI 走查 E-01）；
 * - 其它字段照旧转义，非法 JSON 与无需改写时**一个字节都不动**。
 */
class XssBodySanitizerTest
{
    private static final List<String> TEXT_FIELDS = List.of("content", "title");

    @Test
    void markdownTextFieldsSurviveUntouched()
    {
        String body = "{\"title\":\"Q&A <草稿>\",\"content\":\"# 标题\\n\\n> 引用文字\\n\\na<b\\n\"}";

        // 正文与标题都是 Markdown 文本字段：过滤后必须一个字节都不变
        assertThat(XssBodySanitizer.sanitize(body, TEXT_FIELDS)).isNull();
    }

    @Test
    void otherStringFieldsAreStillEscaped()
    {
        String body = "{\"nickname\":\"a<b\"}";

        String sanitized = XssBodySanitizer.sanitize(body, TEXT_FIELDS);

        assertThat(sanitized).isNotNull();
        assertThat(sanitized).contains("a&lt;b");
        assertThat(sanitized).doesNotContain("a<b");
    }

    @Test
    void escapesNestedObjectsAndArraysButSkipsNestedTextField()
    {
        String body = "{\"data\":{\"content\":\"> 引用\",\"label\":\"a<b\"},\"tags\":[\"a<b\"]}";

        String sanitized = XssBodySanitizer.sanitize(body, TEXT_FIELDS);

        assertThat(sanitized).isNotNull();
        // 任何层级的同名字段都按文本字段放行
        assertThat(sanitized).contains("\"content\":\"> 引用\"");
        assertThat(sanitized).contains("a&lt;b");
    }

    @Test
    void invalidJsonIsPassedThroughInsteadOfRewritten()
    {
        // 连字段都分不清时不猜：改写未知载荷正是旧实现损坏内容的根源
        assertThat(XssBodySanitizer.sanitize("not-json <b>", TEXT_FIELDS)).isNull();
        assertThat(XssBodySanitizer.sanitize("", TEXT_FIELDS)).isNull();
        assertThat(XssBodySanitizer.sanitize(null, TEXT_FIELDS)).isNull();
    }

    @Test
    void emptyTextFieldListEscapesEveryStringValue()
    {
        String body = "{\"content\":\"> 引用\"}";

        String sanitized = XssBodySanitizer.sanitize(body, List.of());

        assertThat(sanitized).isNotNull();
        assertThat(sanitized).contains("&gt;");
    }
}
