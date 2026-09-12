package com.anynote.file.plugin.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.file.model.bo.MinIOConfig;
import io.minio.http.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Field;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link MinIOFilePlugin} 的纯单测（不连真实 MinIO）。
 * <p>
 * 重点覆盖 §4.4 的双 endpoint 设计：预签名必须用 publicEndPoint（SigV4 把 Host 计入签名），
 * 服务端调用用内网 endPoint。设置 region 后预签名是纯本地计算，所以这里不发网络请求；
 * 真实的 putObject / compose 往返由 {@code MinIOFilePluginIntegrationTest} 打真 MinIO 覆盖。
 *
 * @author 称霸幼儿园
 */
class MinIOFilePluginTest {

    private static MinIOConfig config(String endPoint, String publicEndPoint) {
        return MinIOConfig.builder()
                .endPoint(endPoint)
                .publicEndPoint(publicEndPoint)
                .region("us-east-1")
                .accessKey("anynote")
                .secretKey("AnynoteMinio123")
                .bucketName("anynote")
                .basePath("anynote_Shanghai_one")
                .build();
    }

    private static Object field(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    private static String presign(MinIOFilePlugin plugin, String objectName, Method method) {
        return (String) ReflectionTestUtils.invokeMethod(plugin, "getPreSignedObjectUrl",
                objectName, method, 3600, TimeUnit.SECONDS);
    }

    @Test
    @DisplayName("publicEndPoint 为空时 presignClient 回落到 minioClient（兼容旧配置）")
    void fallsBackToEndPointWhenPublicEndPointMissing() throws Exception {
        for (String empty : new String[] {null, "", "   "}) {
            MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://minio:9000", empty));

            Object minioClient = field(plugin, "minioClient");
            Object presignClient = field(plugin, "presignClient");

            assertNotNull(minioClient);
            assertSame(minioClient, presignClient,
                    "publicEndPoint=[" + empty + "] 时两个客户端必须是同一实例");
        }
    }

    @Test
    @DisplayName("配了 publicEndPoint 时预签名 URL 的 host 取 publicEndPoint，不是内网地址")
    void signsWithPublicEndPointHost() {
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://minio:9000", "http://localhost:9000"));

        String url = presign(plugin, "note/1/a.png", Method.PUT);

        assertNotNull(url);
        URI uri = URI.create(url);
        assertEquals("localhost", uri.getHost(), "签名 host 必须是浏览器可达的那个，否则 SignatureDoesNotMatch");
        assertEquals(9000, uri.getPort());
        // 路径要带 basePath 前缀，与 putObject 的写入位置一致
        assertTrue(uri.getPath().startsWith("/anynote/anynote_Shanghai_one/note/1/a.png"),
                "实际路径：" + uri.getPath());
    }

    @Test
    @DisplayName("未配 publicEndPoint 时签名 host 回落到内网 endPoint")
    void signsWithInternalHostWithoutPublicEndPoint() {
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://minio:9000", null));

        assertEquals("minio", URI.create(presign(plugin, "note/1/a.png", Method.GET)).getHost());
    }

    @Test
    @DisplayName("配了 publicEndPoint 后服务端调用仍走内网地址（流量不出 Docker 网络）")
    void serviceSideClientKeepsInternalEndpoint() throws Exception {
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://minio:9000", "https://oss.example.com"));

        Object minioClient = field(plugin, "minioClient");
        Object presignClient = field(plugin, "presignClient");
        assertNotNull(minioClient);
        assertNotNull(presignClient);
        assertTrue(minioClient != presignClient, "公网入口存在时两个客户端应是不同实例");
    }

    @Test
    @DisplayName("region 缺省时补 us-east-1，且 credential scope 与之一致（不触发 GetBucketLocation）")
    void fillsDefaultRegionIntoCredentialScope() {
        MinIOConfig withoutRegion = config("http://minio:9000", "http://localhost:9000");
        withoutRegion.setRegion(null);
        MinIOFilePlugin plugin = new MinIOFilePlugin(withoutRegion);

        String url = presign(plugin, "note/1/a.png", Method.PUT);

        assertNotNull(url);
        assertTrue(url.contains("X-Amz-Credential") && url.contains("us-east-1"),
                "credential scope 里应带上补齐的 region，实际：" + url);
    }

    @Test
    @DisplayName("multipartFileUpload 在存储不可达时抛 BusinessException，而不是静默返回空串")
    void multipartUploadFailsLoudlyWhenStorageUnreachable() {
        // 指向不可达端口：旧实现的 `return ""` 会让调用方拿到空 objectName 却以为成功
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://127.0.0.1:1", "http://127.0.0.1:1"));
        MockMultipartFile file = new MockMultipartFile("file", "report.pdf",
                "application/pdf", "pdf-bytes".getBytes());

        assertThrows(BusinessException.class,
                () -> plugin.multipartFileUpload(file, "doc/pdf", "report.pdf"));
    }

    @Test
    @DisplayName("removeObjects 对 null / 空列表不做事，不抛 NPE")
    void removeObjectsToleratesEmptyInput() {
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://minio:9000", "http://localhost:9000"));

        plugin.removeObjects(null);
        plugin.removeObjects(Collections.emptyList());
        // 不抛异常即通过
        assertNotNull(plugin);
    }

    @Test
    @DisplayName("删除分片失败只记日志、不向上抛（上传已成功不应被清理失败拖累）")
    void removeObjectsSwallowsFailure() {
        MinIOFilePlugin plugin = new MinIOFilePlugin(config("http://127.0.0.1:1", "http://127.0.0.1:1"));

        plugin.removeObjects(Arrays.asList("note/1/a_chunk_1", "note/1/a_chunk_2"));
        // 走到这里说明连接失败没有外泄
        assertTrue(true);
    }
}
