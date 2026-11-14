package com.anynote.note.utils;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Markdown 标题、代码块和行边界单元测试。
 *
 * @author 称霸幼儿园
 */
class KnowledgeMarkdownUtilTest {

    /**
     * 代码块中的井号行不作为标题。
     */
    @Test
    void ignoresHeadingsInsideCodeFence() {
        List<KnowledgeMarkdownUtil.Heading> headings = KnowledgeMarkdownUtil.headings(
                "# 标题\n```markdown\n# 示例代码\n```\n## 小节\n");

        assertThat(headings).extracting(KnowledgeMarkdownUtil.Heading::title)
                .containsExactly("标题", "小节");
    }

    /**
     * 行范围保留原始换行，空正文仍有一个空行。
     */
    @Test
    void preservesNewlinesAndEmptyContent() {
        assertThat(KnowledgeMarkdownUtil.lineRange("甲\r\n乙\n", 1, 2)).isEqualTo("甲\r\n乙\n");
        assertThat(KnowledgeMarkdownUtil.lineRange("", 1, 1)).isEmpty();
        assertThat(KnowledgeMarkdownUtil.lineRange("甲", 2, 2)).isNull();
    }
}
