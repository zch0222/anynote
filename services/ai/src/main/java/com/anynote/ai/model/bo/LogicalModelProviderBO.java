package com.anynote.ai.model.bo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 逻辑模型绑定的供应商：供应商标识与过程视图思考全文的截断字数。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LogicalModelProviderBO {

    /**
     * 供应商标识。
     */
    private String providerKey;

    /**
     * 过程视图思考全文的截断字数。
     */
    private Integer processReasoningMaxChars;
}
