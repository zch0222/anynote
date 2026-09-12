package com.anynote.file.service.impl;

import com.anynote.common.redis.constant.RedisKey;
import com.anynote.common.redis.service.RedisService;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.ServletUtils;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.model.bo.ObjectURL;
import com.anynote.file.api.model.bo.OssSliceUploadTaskInfo;
import com.anynote.file.api.model.bo.OssSliceUploadChunkSignature;
import com.anynote.file.api.model.po.FilePO;
import com.anynote.file.api.model.vo.OssSliceUploadChunkMarkVO;
import com.anynote.file.enums.OssTypeEnum;
import com.anynote.file.factory.FilePluginFactory;
import com.anynote.file.mapper.FileMapper;
import com.anynote.file.model.bo.OssObjectComposeResponse;
import com.anynote.file.plugin.FilePlugin;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link FileServiceImpl} 的纯单测：覆盖 ownership 收口、redirect 依赖的按 id 签名、
 * 以及分片清理 / 标记这两个 P2 缺陷修复。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileServiceImplTest {

    private static final long USER_ID = 7L;
    private static final long OTHER_USER_ID = 8L;
    private static final long FILE_ID = 100L;
    private static final String OBJECT_NAME = "note/42/images/a.png";

    @Mock
    private FileMapper fileMapper;

    @Mock
    private FilePluginFactory filePluginFactory;

    @Mock
    private RedisService redisService;

    @Mock
    private FilePlugin filePlugin;

    private FileServiceImpl fileService;

    @BeforeEach
    void setUp() {
        fileService = new FileServiceImpl();
        ReflectionTestUtils.setField(fileService, "baseMapper", fileMapper);
        ReflectionTestUtils.setField(fileService, "filePluginFactory", filePluginFactory);
        ReflectionTestUtils.setField(fileService, "redisService", redisService);
        when(filePluginFactory.filePlugin()).thenReturn(filePlugin);
        when(filePluginFactory.ossType()).thenReturn(OssTypeEnum.MIN_IO);
        loginAs(USER_ID);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    private static void loginAs(long userId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(SecurityConstants.DETAILS_USER_ID, String.valueOf(userId));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private FilePO fileOwnedBy(long userId) {
        FilePO filePO = new FilePO();
        filePO.setId(FILE_ID);
        filePO.setObjectName(OBJECT_NAME);
        filePO.setOssType(OssTypeEnum.MIN_IO.name());
        filePO.setCreateBy(userId);
        return filePO;
    }

    private ObjectURL someUrl() {
        return ObjectURL.builder().url("http://localhost:9000/anynote/x?X-Amz-Signature=s").build();
    }

    // ---------- getObjectUrlByFileId：redirect 端点的归属校验 ----------

    @Test
    @DisplayName("按 fileId 签名：本人文件返回 URL，并按 objectName 查缓存")
    void signsOwnFileByFileId() {
        when(fileMapper.selectById(FILE_ID)).thenReturn(fileOwnedBy(USER_ID));
        when(redisService.getCacheObject(anyString())).thenReturn(null);
        when(filePlugin.getObjectUrl(eq(OBJECT_NAME), anyInt())).thenReturn(someUrl());

        ObjectURL url = fileService.getObjectUrlByFileId(FILE_ID);

        assertEquals("http://localhost:9000/anynote/x?X-Amz-Signature=s", url.getUrl());
        // 缓存 key 用的是 objectName，而不是 fileId：同一对象换入口时应命中同一份签名。
        // RedisKey.OSS_OBJECT_URL 是 `oss_object_url:{}`，由 StringUtils.format 以 {} 占位展开。
        verify(redisService).getCacheObject("oss_object_url:" + OBJECT_NAME);
    }

    @Test
    @DisplayName("按 fileId 签名：文件不存在抛 A0301（不泄露存在性）")
    void rejectsMissingFile() {
        when(fileMapper.selectById(FILE_ID)).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> fileService.getObjectUrlByFileId(FILE_ID));

        assertEquals(ResCode.UNAUTHORIZED_ERROR, exception.getErrorCode());
        verify(filePlugin, never()).getObjectUrl(anyString(), anyInt());
    }

    @Test
    @DisplayName("按 fileId 签名：他人的文件抛 A0301，且不做任何签名")
    void rejectsOtherUsersFile() {
        when(fileMapper.selectById(FILE_ID)).thenReturn(fileOwnedBy(OTHER_USER_ID));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> fileService.getObjectUrlByFileId(FILE_ID));

        assertEquals(ResCode.UNAUTHORIZED_ERROR, exception.getErrorCode());
        verify(filePlugin, never()).getObjectUrl(anyString(), anyInt());
    }

    @Test
    @DisplayName("按 fileId 签名：命中 Redis 缓存时不重复签名")
    void reusesCachedUrlByFileId() {
        when(fileMapper.selectById(FILE_ID)).thenReturn(fileOwnedBy(USER_ID));
        when(redisService.getCacheObject(anyString())).thenReturn(someUrl());

        fileService.getObjectUrlByFileId(FILE_ID);

        verify(filePlugin, never()).getObjectUrl(anyString(), anyInt());
    }

    @Test
    @DisplayName("按 fileId 签名：华为历史数据没有 objectName 时明确报错，不退化成空 URL")
    void rejectsFileWithoutObjectName() {
        FilePO legacy = fileOwnedBy(USER_ID);
        legacy.setObjectName(null);
        when(fileMapper.selectById(FILE_ID)).thenReturn(legacy);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> fileService.getObjectUrlByFileId(FILE_ID));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }

    @Test
    @DisplayName("签名缓存 TTL 收敛到 1 小时，不再是 7 天")
    void cachesSignedUrlForOneHour() {
        when(fileMapper.selectById(FILE_ID)).thenReturn(fileOwnedBy(USER_ID));
        when(redisService.getCacheObject(anyString())).thenReturn(null);
        when(filePlugin.getObjectUrl(eq(OBJECT_NAME), anyInt())).thenReturn(someUrl());

        fileService.getObjectUrlByFileId(FILE_ID);

        // 签名有效期与缓存 TTL 都应是 3600 秒量级：7 天缓存会让地址吊销严重滞后
        verify(filePlugin).getObjectUrl(OBJECT_NAME, 3600);
        verify(redisService).setCacheObject(anyString(), any(), eq(3540L), any());
    }

    // ---------- getObjectUrlByObjectName：越权收口 ----------

    @Test
    @DisplayName("按 objectName 签名：对象不在 file 表时抛 A0301")
    void rejectsUnknownObjectName() {
        when(fileMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> fileService.getObjectUrlByObjectName(OBJECT_NAME));

        assertEquals(ResCode.UNAUTHORIZED_ERROR, exception.getErrorCode());
        verify(filePlugin, never()).getObjectUrl(anyString(), anyInt());
    }

    @Test
    @DisplayName("按 objectName 签名：对象归属他人时抛 A0301（不再靠 UUID 难猜）")
    void rejectsObjectNameOwnedByOther() {
        when(fileMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(fileOwnedBy(OTHER_USER_ID));

        assertThrows(BusinessException.class, () -> fileService.getObjectUrlByObjectName(OBJECT_NAME));

        verify(filePlugin, never()).getObjectUrl(anyString(), anyInt());
    }

    @Test
    @DisplayName("按 objectName 签名：本人对象正常返回")
    void signsOwnObjectName() {
        when(fileMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(fileOwnedBy(USER_ID));
        when(redisService.getCacheObject(anyString())).thenReturn(null);
        when(filePlugin.getObjectUrl(eq(OBJECT_NAME), anyInt())).thenReturn(someUrl());

        assertNotNull(fileService.getObjectUrlByObjectName(OBJECT_NAME));
    }

    // ---------- markOssUploadSlice：只把校验通过的分片写进集合 ----------

    @Test
    @DisplayName("伪造不存在的分片：不进集合，已标记列表为空")
    void doesNotMarkNonexistentChunk() throws Exception {
        when(redisService.getCacheObject(anyString())).thenReturn(taskInfo());
        when(filePlugin.exist(anyString())).thenReturn(false);

        Set<Integer> requested = new HashSet<>(List.of(1, 999));
        OssSliceUploadChunkMarkVO result = fileService.markOssUploadSlice("u1", requested);

        assertTrue(result.getMarkedIndexList().isEmpty());
        // 旧实现写入的是请求里的全部 index，校验形同虚设；这里必须写校验通过的那个子集
        verify(redisService).addToSet(anyString(), eq(Collections.emptyList()));
    }

    @Test
    @DisplayName("只标记真实存在的分片，伪造的 index 被丢掉")
    void marksOnlyExistingChunks() throws Exception {
        when(redisService.getCacheObject(anyString())).thenReturn(taskInfo());
        // 第 2 片存在、第 999 片不存在；其余一律按不存在处理
        when(filePlugin.exist(org.mockito.ArgumentMatchers.contains("_chunk_2"))).thenReturn(true);
        when(filePlugin.exist(org.mockito.ArgumentMatchers.contains("_chunk_999"))).thenReturn(false);

        Set<Integer> requested = new HashSet<>(List.of(2, 999));
        OssSliceUploadChunkMarkVO result = fileService.markOssUploadSlice("u1", requested);

        assertEquals(List.of(2), result.getMarkedIndexList());
        verify(redisService).addToSet(anyString(), eq(List.of(2)));
    }

    // ---------- ossSliceUploadComposeObject：合并后删分片 ----------

    @Test
    @DisplayName("合并成功后删除临时分片，避免 bucket 垃圾只增不减")
    void removesChunksAfterCompose() {
        OssSliceUploadTaskInfo task = taskInfo();
        task.setTotalChunk(2);
        when(redisService.getCacheObject(anyString())).thenReturn(task);
        when(redisService.getCacheSet(anyString())).thenReturn(new HashSet<>(List.of(1, 2)));
        when(filePlugin.composeOssSliceUploadObject(any(), anyString()))
                .thenReturn(OssObjectComposeResponse.builder().hash("etag").build());
        when(fileMapper.insert(any(FilePO.class))).thenReturn(1);

        fileService.ossSliceUploadComposeObject("u1");

        verify(filePlugin).removeObjects(any());
        // 任务 key 与"已完成分片"集合两个 key 都要清掉
        verify(redisService, times(2)).deleteObject(anyString());
    }

    @Test
    @DisplayName("分片清理抛异常不影响已成功的合并结果（best-effort）")
    void toleratesChunkCleanupFailure() {
        OssSliceUploadTaskInfo task = taskInfo();
        task.setTotalChunk(1);
        when(redisService.getCacheObject(anyString())).thenReturn(task);
        when(redisService.getCacheSet(anyString())).thenReturn(new HashSet<>(List.of(1)));
        when(filePlugin.composeOssSliceUploadObject(any(), anyString()))
                .thenReturn(OssObjectComposeResponse.builder().hash("etag").build());
        when(fileMapper.insert(any(FilePO.class))).thenReturn(1);
        org.mockito.Mockito.doThrow(new RuntimeException("storage down"))
                .when(filePlugin).removeObjects(any());

        // 不应把清理失败暴露成上传失败
        assertNotNull(fileService.ossSliceUploadComposeObject("u1"));
    }

    // ---------- createHuaweiOBSTemporarySignature 在 MIN_IO 下必须拒绝 ----------

    @Test
    @DisplayName("OSS_TYPE=MIN_IO 时华为临时签名端点明确拒绝，不静默落华为")
    void rejectsHuaweiSignatureUnderMinio() {
        when(filePluginFactory.ossType()).thenReturn(OssTypeEnum.MIN_IO);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> fileService.createHuaweiOBSTemporarySignature("note/1", "a.png", 3600L,
                        "image/png", 0));

        assertEquals(ResCode.BUSINESS_ERROR, exception.getErrorCode());
        verify(redisService, never()).setCacheObject(anyString(), any(), anyLong(), any());
    }

    // ---------- 创建任务时写 TTL ----------

    @Test
    @DisplayName("创建分片任务时写入 24h TTL，放弃的上传不会永久残留")
    void writesTaskTtlOnCreate() {
        when(filePlugin.createOssSliceUploadTask(any(), any(), anyString(), anyString(), anyString()))
                .thenReturn(OssSliceUploadTaskInfo.builder()
                        .ossType(OssTypeEnum.MIN_IO.name())
                        .totalChunk(1)
                        .chunkSize(5)
                        .chunkFolder("note/42/images/u1")
                        .objectName("note/42/images/u1/a.png")
                        .build());

        fileService.createOssSliceUploadTask("note/42/images", "a.png", "hash", 1.0,
                "image/png", 0);

        verify(redisService).setCacheObject(anyString(), any(), eq(86400L), any());
    }

    private OssSliceUploadTaskInfo taskInfo() {
        FilePO filePO = new FilePO();
        filePO.setFileName("a.png");
        filePO.setOriginalFileName("a.png");
        filePO.setHash("hash");
        filePO.setFileSize(1.0);
        filePO.setCreateBy(USER_ID);
        return OssSliceUploadTaskInfo.builder()
                .ossType(OssTypeEnum.MIN_IO.name())
                .totalChunk(1)
                .chunkSize(5)
                .chunkFolder("note/42/images/u1")
                .objectName("note/42/images/u1/a.png")
                .uploadId("u1")
                .fileInfo(filePO)
                .build();
    }
}
