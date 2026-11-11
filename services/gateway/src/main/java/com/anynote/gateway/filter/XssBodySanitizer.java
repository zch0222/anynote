package com.anynote.gateway.filter;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import com.anynote.core.utils.html.EscapeUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 请求体的**结构化** XSS 过滤（按 JSON 字段判断，而不是把整个请求体当成一段 HTML）。
 *
 * 旧实现是 `EscapeUtil.clean(bodyStr)`：把整包请求体当 HTML 文本做实体转义，
 * 于是正文里的 `>` 变 `&gt;`、`<` 变 `&lt;`。Markdown 的块语法全在这两个字符上——
 * 引用块（`> 引用`）、HTML 片段、行内代码里的比较符号，保存一次就变成另一种字面量，
 * 刷新后结构丢失，用户无法还原（UI 走查 E-01，2026-09-14 与 2026-11-11 两次复现）。
 *
 * 现在的口径是**按字段分层**：
 *
 * - `security.xss.textFields` 列出的字段（笔记正文、标题等 Markdown 文本）**原样放行**。
 *   它们的转义责任在渲染边界（ProseMirror 的 schema / React 的文本节点），
 *   服务端在这里改一个字符都是数据损坏。
 * - 其余字符串字段照旧做实体转义，原有防护面不变。
 * - 请求体不是合法 JSON 时**一律不改写**：连字段都分不清时改写等于赌，后续校验会把非法请求拒掉。
 * - 没有任何字段真的被改写时不回写请求体（避免无谓的重序列化与 content-length 抖动）。
 *
 * @author 称霸幼儿园
 */
public final class XssBodySanitizer
{
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private XssBodySanitizer()
    {
    }

    /**
     * 按字段过滤 JSON 请求体。
     *
     * @param body       原始请求体
     * @param textFields 原样放行的字段名（Markdown 文本字段）
     * @return 改写后的请求体；无需改写或无法解析时返回 {@code null}，调用方应原样透传
     */
    public static String sanitize(String body, Collection<String> textFields)
    {
        if (body == null || body.isEmpty())
        {
            return null;
        }
        JsonNode root;
        try
        {
            root = MAPPER.readTree(body);
        }
        catch (JsonProcessingException e)
        {
            // 不是合法 JSON：不猜、不改，交给下游的参数校验
            return null;
        }
        if (root == null || root.isMissingNode() || !sanitizeNode(root, textFields))
        {
            return null;
        }
        try
        {
            return MAPPER.writeValueAsString(root);
        }
        catch (JsonProcessingException e)
        {
            return null;
        }
    }

    /**
     * 递归过滤一个节点。
     *
     * @return 是否真的改写了内容
     */
    private static boolean sanitizeNode(JsonNode node, Collection<String> textFields)
    {
        if (node == null)
        {
            return false;
        }
        if (node.isObject())
        {
            ObjectNode object = (ObjectNode) node;
            // 先收集字段名：遍历过程中改值会让迭代器看到已变更的节点
            List<String> names = new ArrayList<>();
            object.fieldNames().forEachRemaining(names::add);
            boolean changed = false;
            for (String name : names)
            {
                JsonNode child = object.get(name);
                if (child != null && child.isTextual())
                {
                    if (isTextField(name, textFields))
                    {
                        // Markdown 文本字段：原样放行
                        continue;
                    }
                    String escaped = EscapeUtil.clean(child.textValue());
                    if (!escaped.equals(child.textValue()))
                    {
                        object.put(name, escaped);
                        changed = true;
                    }
                }
                else if (sanitizeNode(child, textFields))
                {
                    changed = true;
                }
            }
            return changed;
        }
        if (node.isArray())
        {
            ArrayNode array = (ArrayNode) node;
            boolean changed = false;
            for (int i = 0; i < array.size(); i++)
            {
                JsonNode child = array.get(i);
                if (child != null && child.isTextual())
                {
                    String escaped = EscapeUtil.clean(child.textValue());
                    if (!escaped.equals(child.textValue()))
                    {
                        array.set(i, array.textNode(escaped));
                        changed = true;
                    }
                }
                else if (sanitizeNode(child, textFields))
                {
                    changed = true;
                }
            }
            return changed;
        }
        return false;
    }

    private static boolean isTextField(String name, Collection<String> textFields)
    {
        if (textFields == null || textFields.isEmpty())
        {
            return false;
        }
        for (String field : textFields)
        {
            if (field != null && field.equals(name))
            {
                return true;
            }
        }
        return false;
    }
}
