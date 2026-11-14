package com.anynote.note.utils;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Markdown 行范围与 ATX 标题工具。
 *
 * @author 称霸幼儿园
 */
public final class KnowledgeMarkdownUtil {

    private static final Pattern ATX_HEADING = Pattern.compile("^(#{1,6})[\\t ]+(.+?)[\\t ]*#*[\\t ]*$");
    private static final Pattern FENCE = Pattern.compile("^[\\t ]*(```|~~~).*$");

    private KnowledgeMarkdownUtil() {
    }

    /**
     * 提取 Markdown 标题及行范围。
     *
     * @param content Markdown 原文
     * @return 按原文顺序排列的标题
     */
    public static List<Heading> headings(String content) {
        List<Line> lines = lines(content);
        List<Heading> headings = new ArrayList<>();
        boolean inFence = false;
        for (Line line : lines) {
            String text = line.text();
            if (FENCE.matcher(text).matches()) {
                inFence = !inFence;
                continue;
            }
            if (inFence) {
                continue;
            }
            Matcher matcher = ATX_HEADING.matcher(text.trim());
            if (matcher.matches()) {
                headings.add(new Heading(matcher.group(2), matcher.group(1).length(), line.number(), line.number()));
            }
        }
        for (int i = 0; i < headings.size(); i++) {
            Heading heading = headings.get(i);
            int endLine = lines.size();
            for (int j = i + 1; j < headings.size(); j++) {
                Heading next = headings.get(j);
                if (next.level() <= heading.level()) {
                    endLine = next.startLine() - 1;
                    break;
                }
            }
            headings.set(i, new Heading(heading.title(), heading.level(), heading.startLine(), endLine));
        }
        return headings;
    }

    /**
     * 读取指定标题至下一个同级或更高级标题之前的原文。
     *
     * @param content Markdown 原文
     * @param heading 标题文本
     * @return 标题段原文，未找到时返回 null
     */
    public static String headingSection(String content, String heading) {
        for (Heading item : headings(content)) {
            if (item.title().equals(heading)) {
                return lineRange(content, item.startLine(), item.endLine());
            }
        }
        return null;
    }

    /**
     * 读取从 1 开始的闭区间行范围，保留原始换行符。
     *
     * @param content 原文
     * @param startLine 起始行
     * @param endLine 结束行
     * @return 行范围原文
     */
    public static String lineRange(String content, int startLine, int endLine) {
        List<Line> lines = lines(content);
        if (startLine < 1 || endLine < startLine || startLine > lines.size()) {
            return null;
        }
        int from = lines.get(startLine - 1).start();
        int to = lines.get(Math.min(endLine, lines.size()) - 1).endWithNewline();
        return content.substring(from, to);
    }

    private static List<Line> lines(String content) {
        List<Line> lines = new ArrayList<>();
        int start = 0;
        int number = 1;
        for (int i = 0; i < content.length(); i++) {
            char current = content.charAt(i);
            if (current != '\n' && current != '\r') {
                continue;
            }
            lines.add(new Line(number++, start, i, i + 1, content.substring(start, i)));
            if (current == '\r' && i + 1 < content.length() && content.charAt(i + 1) == '\n') {
                i++;
                lines.get(lines.size() - 1).endWithNewline = i + 1;
            }
            start = i + 1;
        }
        lines.add(new Line(number, start, content.length(), content.length(), content.substring(start)));
        return lines;
    }

    /**
     * Markdown 标题。
     */
    public record Heading(String title, int level, int startLine, int endLine) {
    }

    private static final class Line {
        private final int number;
        private final int start;
        private final int end;
        private int endWithNewline;
        private final String text;

        private Line(int number, int start, int end, int endWithNewline, String text) {
            this.number = number;
            this.start = start;
            this.end = end;
            this.endWithNewline = endWithNewline;
            this.text = text;
        }

        private int number() {
            return number;
        }

        private int start() {
            return start;
        }

        private int endWithNewline() {
            return endWithNewline;
        }

        private String text() {
            return text;
        }
    }
}
