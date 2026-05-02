package com.anynote.ai.api.model.bo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotNull;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RagFileIndexReq {

    @NotNull(message = "文件地址不能为空")
    private String file_path;
}
