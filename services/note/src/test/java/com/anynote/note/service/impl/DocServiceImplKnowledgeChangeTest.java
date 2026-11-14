package com.anynote.note.service.impl;

import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.model.po.FilePO;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.model.bo.DocCreateParam;
import com.anynote.note.model.bo.DocDeleteParam;
import com.anynote.note.model.bo.PDFCreateParam;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 资料两种创建与删除时的知识变更单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DocServiceImplKnowledgeChangeTest {

    @Mock private DocMapper docMapper;
    @Mock private RemoteFileService fileService;
    @Mock private TokenUtil tokenUtil;
    @Mock private KnowledgeChangeService changeService;
    @Mock private RocketMQTemplate rocketMQTemplate;
    @Mock private RocketMQProperties rocketMQProperties;
    @Mock private MultipartFile multipartFile;

    private DocServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new DocServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", docMapper);
        ReflectionTestUtils.setField(service, "remoteFileService", fileService);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "knowledgeChangeService", changeService);
        ReflectionTestUtils.setField(service, "rocketMQTemplate", rocketMQTemplate);
        ReflectionTestUtils.setField(service, "rocketMQProperties", rocketMQProperties);
        SysUser sysUser = new SysUser();
        sysUser.setId(7L);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(7L);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
        when(rocketMQProperties.getDocTopic()).thenReturn("doc-topic");
    }

    /**
     * 直接 PDF 创建成功后记录 DOC CREATE。
     */
    @Test
    void directPdfCreateRecordsChange() {
        when(fileService.uploadFile(any(), anyString(), anyLong(), anyString(), anyInt()))
                .thenReturn(ResData.success(FilePO.builder().id(2L).originalFileName("a.pdf").build()));
        when(docMapper.insert(any(Doc.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, Doc.class).setId(10L);
            return 1;
        });
        PDFCreateParam param = PDFCreateParam.PDFCreateParamBuilder()
                .knowledgeBaseId(3L).uploadId("upload").pdf(multipartFile).build();

        service.createPDF(param);

        verify(changeService).record(KnowledgeEntityType.DOC, 10L, 3L, KnowledgeOperation.CREATE);
    }

    /**
     * 完成上传创建成功后记录 DOC CREATE，并保留名称翻译消息。
     */
    @Test
    void completeUploadCreateRecordsChange() {
        when(fileService.completeHuaweiOBSUpload(any())).thenReturn(
                ResData.success(FilePO.builder().id(2L).originalFileName("b.pdf").build()));
        when(docMapper.insert(any(Doc.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, Doc.class).setId(11L);
            return 1;
        });
        DocCreateParam param = DocCreateParam.DocCreateParamBuilder()
                .knowledgeBaseId(3L).uploadId("upload").hash("hash").docName("b.pdf").build();

        service.completeDocUpload(param);

        verify(changeService).record(KnowledgeEntityType.DOC, 11L, 3L, KnowledgeOperation.CREATE);
        verify(rocketMQTemplate).asyncSend(anyString(), any(Object.class), any());
    }

    /**
     * 删除资料使用删除前的知识库归属记录 DOC DELETE。
     */
    @Test
    void deleteRecordsPreviousKnowledgeBase() {
        when(docMapper.selectById(10L)).thenReturn(Doc.builder().id(10L).knowledgeBaseId(3L).build());
        when(docMapper.deleteById(10L)).thenReturn(1);
        DocDeleteParam param = new DocDeleteParam();
        param.setDocId(10L);

        service.deleteDoc(param);

        verify(changeService).record(KnowledgeEntityType.DOC, 10L, 3L, KnowledgeOperation.DELETE);
    }
}
