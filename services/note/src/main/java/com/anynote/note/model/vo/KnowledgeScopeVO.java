package com.anynote.note.model.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 用户检索范围。
 *
 * @author 称霸幼儿园
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "用户检索范围")
public class KnowledgeScopeVO {

    private Long userId;
    private boolean admin;
    private boolean defaultScope;
    private List<KnowledgeBase> knowledgeBases;

    /**
     * 知识库成员范围。
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "知识库成员范围")
    public static class KnowledgeBase {
        private Long kbId;
        private String name;
        private String role;
        private Integer permissions;
        private boolean explicit;
    }
}
