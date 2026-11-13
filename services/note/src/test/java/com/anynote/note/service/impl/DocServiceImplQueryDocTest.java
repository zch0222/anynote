package com.anynote.note.service.impl;

import com.anynote.note.datascope.annotation.RequiresDocPermissions;
import com.anynote.core.exception.BusinessException;
import com.anynote.note.model.bo.DocQueryParam;
import com.anynote.note.model.bo.DocRagQueryParam;
import com.anynote.note.api.model.vo.DocVO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link DocServiceImpl} PDF 问答废弃路径单元测试。
 *
 * @author 称霸幼儿园
 */
class DocServiceImplQueryDocTest {

    @Test
    @DisplayName("文档存在且权限校验通过后返回约定的废弃文案")
    void deprecatesPdfQaAfterExistenceCheck() {
        DocServiceImpl docService = new DocServiceImpl() {
            @Override
            public DocVO getDocById(DocQueryParam queryParam) {
                return new DocVO();
            }
        };
        DocRagQueryParam queryParam = DocRagQueryParam.DocRagQueryParamBuilder()
                .docId(1L)
                .prompt("问点什么")
                .build();

        assertThatThrownBy(() -> docService.queryDoc(queryParam))
                .isInstanceOf(BusinessException.class)
                .hasMessage("PDF 问答功能已暂停，后续版本将恢复");
    }

    @Test
    @DisplayName("废弃后仍保留阅读权限注解")
    void keepsReadPermissionAnnotation() throws NoSuchMethodException {
        Method method = DocServiceImpl.class.getMethod("queryDoc", DocRagQueryParam.class);

        assertThat(method.getAnnotation(RequiresDocPermissions.class)).isNotNull();
    }
}
