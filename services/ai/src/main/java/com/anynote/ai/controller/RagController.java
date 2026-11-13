package com.anynote.ai.controller;

import com.anynote.ai.api.model.dto.DocQueryDTO;
import com.anynote.ai.api.model.vo.DocQueryVO;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * RAG 检索 Controller。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Tag(name = "RAG检索", description = "知识库RAG检索接口")
@RestController
@RequestMapping("/rag")
public class RagController {

    /**
     * 文档问答入口，M16.6 恢复为范围限定到单个资料的运行。
     *
     * @param docQueryDTO 文档问答请求
     * @return 文档问答结果
     */
    @PostMapping("query/docs/v1")
    public ResData<DocQueryVO> queryDocV1(@Validated @RequestBody DocQueryDTO docQueryDTO) {
        throw new BusinessException("查询文档 RAG v1 暂未实现", ResCode.BUSINESS_ERROR);
    }
}
