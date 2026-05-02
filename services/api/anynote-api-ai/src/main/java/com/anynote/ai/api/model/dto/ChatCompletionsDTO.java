package com.anynote.ai.api.model.dto;

import com.anynote.core.web.model.bo.QueryParam;
import lombok.*;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Data
public class ChatCompletionsDTO extends QueryParam {
    /**
     * 对话id
     */
    private Long conversationId;


    /**
     * prompt
     */
    @NotEmpty(message = "问题不能为空")
    private String prompt;

    private String model;

}
