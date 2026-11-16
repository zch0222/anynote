package com.anynote.note.api.model.vo;

import lombok.Data;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Date;

/**
 * @author 称霸幼儿园
 */
@Data
public class DocVO {


    /**
     * 知识库ID
     */
    private Long id;

    /**
     * 知识库名称
     */
    private String docName;

    private Integer indexStatus;

    private String englishDocName;

    /**
     * 创建者ID
     */
    private Long createBy;

    private String creatorNickname;

    private String creatorUsername;

    private Long knowledgeBaseId;

    private Date createTime;

    private Date updateTime;

    private String url;

    /** 资料关联的文件标识。 */
    @Schema(description = "资料关联的文件标识")
    private Long fileId;

    private String hash;

    private Integer permission;

}
