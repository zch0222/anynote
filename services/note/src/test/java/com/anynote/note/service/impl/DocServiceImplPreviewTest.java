package com.anynote.note.service.impl;

import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.model.bo.ObjectURL;
import com.anynote.note.api.model.vo.DocVO;
import com.anynote.note.datascope.aspect.RequiresDocPermissionsAspect;
import com.anynote.note.enums.DocPermissions;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.model.bo.DocQueryParam;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 资料预览地址转换单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class DocServiceImplPreviewTest {

    @Mock
    private DocMapper mapper;
    @Mock
    private RemoteFileService remoteFileService;

    private DocServiceImpl service;
    private DocQueryParam query;
    private DocVO doc;

    /** 初始化已通过资料阅读权限校验的调用。 */
    @BeforeEach
    void setUp() {
        service = new DocServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
        ReflectionTestUtils.setField(service, "remoteFileService", remoteFileService);
        query = DocQueryParam.DocQueryParamBuilder().docId(1L).build();
        query.setParams(java.util.Map.of(RequiresDocPermissionsAspect.DOC_PERMISSIONS, DocPermissions.READ));
        doc = new DocVO();
        doc.setId(1L);
        doc.setFileId(99L);
        when(mapper.selectDocById(1L)).thenReturn(doc);
    }

    /** 对象键转换为签名地址，保留资料阅读权限。 */
    @Test
    void resolvesStorageKeyToPreviewUrl() {
        doc.setUrl("ai/doc/pdf/sample.pdf");
        when(remoteFileService.getDocPreviewUrl(99L, SecurityConstants.INNER))
                .thenReturn(ResData.success(ObjectURL.builder().url("http://localhost:9000/signed.pdf").build()));
        DocVO result = service.getDocById(query);
        assertThat(result.getUrl()).isEqualTo("http://localhost:9000/signed.pdf");
        assertThat(result.getPermission()).isEqualTo(DocPermissions.READ.getValue());
    }

    /** 历史绝对地址不重复签名。 */
    @Test
    void preservesAbsoluteLegacyUrl() {
        doc.setUrl("https://files.example.com/sample.pdf");
        assertThat(service.getDocById(query).getUrl()).isEqualTo(doc.getUrl());
        verifyNoInteractions(remoteFileService);
    }

    /** 签名服务不可用时只返回已确认文案。 */
    @Test
    void usesConfirmedPreviewFailureMessage() {
        doc.setUrl("ai/doc/pdf/sample.pdf");
        when(remoteFileService.getDocPreviewUrl(99L, SecurityConstants.INNER))
                .thenReturn(ResData.error(ResCode.INNER_FILE_SERVICE_ERROR));
        assertThatThrownBy(() -> service.getDocById(query))
                .isInstanceOf(BusinessException.class).hasMessage("服务暂时不可用，请稍后重试");
    }
}
