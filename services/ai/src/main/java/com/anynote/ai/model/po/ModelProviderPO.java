package com.anynote.ai.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 模型供应商目录持久化对象，对应表 {@code a_model_provider}。
 *
 * <p>表内 {@code api_key_cipher} 保存 AES-GCM 密文；{@code models} 列为 JSON 数组，
 * 在本对象中用 {@link #modelsJson} 以字符串接收，由业务层负责序列化/反序列化。</p>
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("a_model_provider")
public class ModelProviderPO {

    /**
     * 主键，自增。
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 供应商标识，唯一。
     */
    private String providerKey;

    /**
     * 供应商展示名。
     */
    private String displayName;

    /**
     * 协议类型，默认 {@code openai_compatible}。
     */
    private String protocol;

    /**
     * 接口基地址。
     */
    private String baseUrl;

    /**
     * API Key 的 AES-GCM 密文（Base64(iv || ciphertext || tag)）。
     */
    private String apiKeyCipher;

    /**
     * 模型名数组，数据库列名为 {@code models}，内容为 JSON 数组字符串。
     */
    @TableField("models")
    private String modelsJson;

    /**
     * 是否允许数据出境：0 否，1 是。
     */
    private Integer dataEgressAllowed;

    /**
     * 是否启用：0 停用，1 启用。
     */
    private Integer enabled;

    /**
     * 版本号，每次更新 +1。
     */
    private Long version;

    /**
     * 创建者。
     */
    private Long createBy;

    /**
     * 更新者。
     */
    private Long updateBy;

    /**
     * 创建时间。
     */
    private Date createTime;

    /**
     * 更新时间。
     */
    private Date updateTime;
}
