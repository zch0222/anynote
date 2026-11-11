package com.anynote.gateway.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

/**
 * XSS跨站脚本配置
 * 
 * @author ruoyi
 */
@Configuration
@RefreshScope
@ConfigurationProperties(prefix = "security.xss")
public class XssProperties
{
    /**
     * Xss开关
     */
    private Boolean enabled;

    /**
     * 排除路径
     */
    private List<String> excludeUrls = new ArrayList<>();

    /**
     * 原样放行的字段名（Markdown 文本字段，如笔记正文与标题）。
     *
     * 这些字段的请求体**不做实体转义**：`>` / `<` 是 Markdown 块语法的组成部分，
     * 服务端一改写就等于损坏用户内容（引用块保存后变普通段落，见 UI 走查 E-01）。
     * 转义责任交给渲染边界（ProseMirror 的 schema、React 的文本节点）。
     *
     * 默认覆盖笔记的 `content` / `title`；其它服务的富文本字段按需在 Nacos 追加。
     */
    private List<String> textFields = new ArrayList<>(List.of("content", "title"));

    public Boolean getEnabled()
    {
        return enabled;
    }

    public void setEnabled(Boolean enabled)
    {
        this.enabled = enabled;
    }

    public List<String> getExcludeUrls()
    {
        return excludeUrls;
    }

    public void setExcludeUrls(List<String> excludeUrls)
    {
        this.excludeUrls = excludeUrls;
    }

    public List<String> getTextFields()
    {
        return textFields;
    }

    public void setTextFields(List<String> textFields)
    {
        this.textFields = textFields;
    }
}
