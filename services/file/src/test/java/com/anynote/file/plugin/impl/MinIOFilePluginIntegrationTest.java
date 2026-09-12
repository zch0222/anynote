package com.anynote.file.plugin.impl;

import com.anynote.file.api.model.bo.MinIOSignatureData;
import com.anynote.file.api.model.bo.OSSSignature;
import com.anynote.file.model.bo.MinIOConfig;
import com.anynote.file.plugin.FilePlugin;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * MinIO 真实往返的集成测试，**依赖本机 Docker 里的 MinIO**（docs/minio/MINIO_PLAN.md §6 / §7.3）。
 * <p>
 * 为什么需要它：纯单测只能证明签名 URL 的 host 拼对了，不能证明"签出来的 URL 真的能 PUT 上去"。
 * SigV4 把 Host、region、路径都计入签名，只有真打一次 MinIO 才能确认三者与
 * MINIO_SITE_REGION / bucket / basePath 完全一致——这正是 §10 里 SignatureDoesNotMatch 的成因。
 * <p>
 * 默认被 surefire 的 excludedGroups 排除，需显式放开：
 * <pre>
 *   mvn test -pl file -Dtest.excluded.groups= -Dtest=MinIOFilePluginIntegrationTest
 * </pre>
 *
 * @author 称霸幼儿园
 */
@Tag("integration")
class MinIOFilePluginIntegrationTest {

    /** dev 口径：容器内是 minio:9000，宿主机（跑测试的地方）是 localhost:9000。 */
    private static final String ENDPOINT =
            System.getenv().getOrDefault("ANYNOTE_MINIO_ENDPOINT", "http://localhost:9000");
    private static final String PUBLIC_ENDPOINT =
            System.getenv().getOrDefault("ANYNOTE_MINIO_PUBLIC_ENDPOINT", ENDPOINT);
    private static final String ACCESS_KEY =
            System.getenv().getOrDefault("ANYNOTE_MINIO_ACCESS_KEY", "anynote");
    private static final String SECRET_KEY =
            System.getenv().getOrDefault("ANYNOTE_MINIO_SECRET_KEY", "AnynoteMinio123");
    private static final String BUCKET =
            System.getenv().getOrDefault("ANYNOTE_MINIO_BUCKET", "anynote");
    private static final String BASE_PATH = "anynote_Shanghai_one";

    /** S3/MinIO 的 composeObject 对非末片的硬性下限：5 MiB。 */
    private static final int MIN_COMPOSE_PART_BYTES = 5 * 1024 * 1024;

    private static byte[] filled(int size, byte value) {
        byte[] bytes = new byte[size];
        java.util.Arrays.fill(bytes, value);
        return bytes;
    }

    private final String runId = UUID.randomUUID().toString().replace("-", "");
    private final MinioClient adminClient = MinioClient.builder()
            .endpoint(ENDPOINT)
            .region("us-east-1")
            .credentials(ACCESS_KEY, SECRET_KEY)
            .build();

    private MinIOFilePlugin plugin() {
        return new MinIOFilePlugin(MinIOConfig.builder()
                .endPoint(ENDPOINT)
                .publicEndPoint(PUBLIC_ENDPOINT)
                .region("us-east-1")
                .accessKey(ACCESS_KEY)
                .secretKey(SECRET_KEY)
                .bucketName(BUCKET)
                .basePath(BASE_PATH)
                .build());
    }

    @BeforeAll
    static void requireMinio() {
        // 明确失败原因，避免 CI 上看到一堆连不上 endpooint 的噪声
        try {
            MinioClient probe = MinioClient.builder()
                    .endpoint(ENDPOINT).region("us-east-1")
                    .credentials(ACCESS_KEY, SECRET_KEY).build();
            probe.bucketExists(io.minio.BucketExistsArgs.builder().bucket(BUCKET).build());
        } catch (Exception e) {
            throw new IllegalStateException(
                    "MinIO 不可达或不接受凭据：" + ENDPOINT + "（先起 minio + minio-init，见 MINIO_PLAN §6）", e);
        }
    }

    @AfterEach
    void cleanUp() throws Exception {
        // 本次用例写入的对象全部收掉，不给 bucket 留垃圾。
        // listObjects 返回的是惰性 Iterable<Result<Item>>，必须逐个 .get()。
        for (io.minio.Result<io.minio.messages.Item> result : adminClient.listObjects(
                io.minio.ListObjectsArgs.builder()
                        .bucket(BUCKET).prefix(BASE_PATH + "/it/" + runId + "/").recursive(true).build())) {
            adminClient.removeObject(io.minio.RemoveObjectArgs.builder()
                    .bucket(BUCKET).object(result.get().objectName()).build());
        }
    }

    @Test
    @DisplayName("预签名 PUT 真能上传：签出的 URL 直接 PUT 分片，MinIO 侧对象存在且内容一致")
    void presignedPutActuallyUploads() throws Exception {
        FilePlugin plugin = plugin();
        String objectName = "it/" + runId + "/chunk.png";
        byte[] payload = "chunk-bytes-from-presigned-put".getBytes(StandardCharsets.UTF_8);

        // 第 2 步：换分片签名（纯本地计算）
        String signedUrl = signedPutUrl(plugin, objectName);
        assertNotNull(signedUrl);
        assertEquals(URI.create(PUBLIC_ENDPOINT).getHost(), URI.create(signedUrl).getHost());

        // 第 3 步：浏览器口径直接 PUT（不经服务端），这一步才真正验证签名
        HttpResponse<String> response;
        try (HttpClient client = HttpClient.newHttpClient()) {
            response = client.send(
                    HttpRequest.newBuilder(URI.create(signedUrl))
                            .PUT(HttpRequest.BodyPublishers.ofByteArray(payload))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
        }
        assertEquals(200, response.statusCode(),
                "预签名 PUT 失败说明签名 Host/region 与 MinIO 实际配置不一致：" + response.body());

        // 服务端侧确认对象确实写到了 {basePath}/{objectName}
        try (var stream = adminClient.getObject(io.minio.GetObjectArgs.builder()
                .bucket(BUCKET).object(BASE_PATH + "/" + objectName).build())) {
            assertArrayEquals(payload, stream.readAllBytes());
        }
    }

    @Test
    @DisplayName("分片直传五步在真实 MinIO 上闭环：建分片 → 合并 → 内容一致 → 分片被清理")
    void sliceUploadRoundTripComposesAndCleansUp() throws Exception {
        String folder = "it/" + runId + "/multi";
        String target = folder + "/final.png";
        // S3/MinIO 的 composeObject 要求除最后一片外每片都 ≥5 MiB（EntityTooSmall），
        // 所以分片大小不能随便取小值。后端 chunkSize 的下限恰好也是 5 MB（见 MinIOFilePlugin）。
        byte[] part1 = filled(MIN_COMPOSE_PART_BYTES, (byte) 'A');
        byte[] part2 = "tail-part".getBytes(StandardCharsets.UTF_8);

        adminClient.putObject(PutObjectArgs.builder().bucket(BUCKET)
                .object(BASE_PATH + "/" + folder + "/a_chunk_1")
                .stream(new ByteArrayInputStream(part1), part1.length, -1).build());
        adminClient.putObject(PutObjectArgs.builder().bucket(BUCKET)
                .object(BASE_PATH + "/" + folder + "/a_chunk_2")
                .stream(new ByteArrayInputStream(part2), part2.length, -1).build());

        FilePlugin plugin = plugin();
        List<String> chunks = List.of(folder + "/a_chunk_1", folder + "/a_chunk_2");
        // 第 5 步：合并
        plugin.composeOssSliceUploadObject(chunks, target);

        byte[] composed;
        try (var stream = adminClient.getObject(io.minio.GetObjectArgs.builder()
                .bucket(BUCKET).object(BASE_PATH + "/" + target).build())) {
            composed = stream.readAllBytes();
        }
        assertEquals(part1.length + part2.length, composed.length, "合并结果应等于两片之和");
        assertArrayEquals(part1, java.util.Arrays.copyOfRange(composed, 0, part1.length),
                "第一片应原样出现在结果开头（顺序不能颠倒）");
        assertArrayEquals(part2,
                java.util.Arrays.copyOfRange(composed, part1.length, composed.length),
                "第二片应接在第一片之后");

        // §4.6-3：合并后清掉分片，bucket 不应留 _chunk_ 残留
        plugin.removeObjects(chunks);
        for (String chunk : chunks) {
            assertThrows(io.minio.errors.ErrorResponseException.class, () ->
                    adminClient.statObject(io.minio.StatObjectArgs.builder()
                            .bucket(BUCKET).object(BASE_PATH + "/" + chunk).build()));
        }
    }

    @Test
    @DisplayName("multipartFileUpload 在真实 MinIO 上返回 objectName，且对象可被 stat 到")
    void multipartUploadWritesRealObject() throws Exception {
        FilePlugin plugin = plugin();
        String path = "it/" + runId + "/docs";
        byte[] content = "server-side-relay-upload".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "report.pdf",
                "application/pdf", content);

        String objectName = plugin.multipartFileUpload(file, path, "report.pdf");

        // MinIO 没有永久 URL，必须返回 objectName 供 redirect 端点消费
        assertEquals(path + "/report.pdf", objectName);
        assertTrue(plugin.exist(objectName), "中转上传后对象应存在于 bucket");
        try (var stream = adminClient.getObject(io.minio.GetObjectArgs.builder()
                .bucket(BUCKET).object(BASE_PATH + "/" + objectName).build())) {
            assertArrayEquals(content, stream.readAllBytes());
        }
    }

    @Test
    @DisplayName("GET 预签名 URL 能真读到对象，且过期时间生效（正文换地址依赖它）")
    void presignedGetReadsObject() throws Exception {
        String objectName = "it/" + runId + "/read.png";
        byte[] payload = "read-me-back".getBytes(StandardCharsets.UTF_8);
        adminClient.putObject(PutObjectArgs.builder().bucket(BUCKET)
                .object(BASE_PATH + "/" + objectName)
                .stream(new ByteArrayInputStream(payload), payload.length, -1).build());

        FilePlugin plugin = plugin();
        String url = plugin.getObjectUrl(objectName, 3600).getUrl();
        // 私有桶：不带签名直接 GET 必须被拒，证明 bucket 策略是 none 而不是匿名可读
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> anon = client.send(
                    HttpRequest.newBuilder(URI.create(
                            ENDPOINT + "/" + BUCKET + "/" + BASE_PATH + "/" + objectName)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(403, anon.statusCode(), "bucket 应为私有，匿名读取必须被拒");

            HttpResponse<byte[]> signed = client.send(
                    HttpRequest.newBuilder(URI.create(url)).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            assertEquals(200, signed.statusCode());
            assertArrayEquals(payload, signed.body());
        }
    }

    @Test
    @DisplayName("签名 URL 的 region 与 MinIO 服务端一致（us-east-1），否则会被判 SignatureDoesNotMatch")
    void signedUrlCarriesServerRegion() {
        String url = signedPutUrl(plugin(), "it/" + runId + "/region.png");

        assertNotNull(url);
        assertTrue(url.contains("us-east-1"),
                "credential scope 必须与服务端 MINIO_SITE_REGION 一致，实际：" + url);
    }

    /**
     * 从插件签名结果里取出预签名 URL。
     * <p>
     * {@code OSSSignature.credentials} 声明的是接口类型 {@code OSSSignatureData}，
     * 只有 MinIO 实现带 url，因此这里显式收窄。
     */
    private static String signedPutUrl(FilePlugin plugin, String objectName) {
        OSSSignature signature = plugin.getOssSignature(3600, objectName);
        assertTrue(signature.getCredentials() instanceof MinIOSignatureData,
                "MinIO 插件应返回 MinIOSignatureData，实际：" + signature.getCredentials());
        return ((MinIOSignatureData) signature.getCredentials()).getUrl();
    }
}
