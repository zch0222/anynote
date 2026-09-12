package com.anynote.file.plugin.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.StringUtils;
import com.anynote.file.api.enums.OSSSignatureType;
import com.anynote.file.api.model.bo.FileDTO;
import com.anynote.file.api.model.bo.MinIOSignatureData;
import com.anynote.file.api.model.bo.OSSSignature;
import com.anynote.file.api.model.bo.OssSliceUploadTaskInfo;
import com.anynote.file.enums.OssTypeEnum;
import com.anynote.file.model.bo.MinIOConfig;
import com.anynote.file.api.model.bo.ObjectURL;
import com.anynote.file.model.bo.OssObjectComposeResponse;
import com.anynote.file.plugin.FilePlugin;
import io.minio.*;
import io.minio.credentials.AssumeRoleProvider;
import io.minio.credentials.Credentials;
import io.minio.errors.*;
import io.minio.http.Method;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FilenameUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Slf4j
public class MinIOFilePlugin implements FilePlugin {

    /** region 未配置时的默认值，须与 MinIO 的 MINIO_SITE_REGION 一致。 */
    private static final String DEFAULT_REGION = "us-east-1";

    private final MinIOConfig minIOConfig;

    private final MinioClient minioClient;

    /**
     * 生成预签名 URL 专用客户端，endpoint 取 {@code publicEndPoint}（浏览器可达地址）。
     * <p>
     * 与 {@link #minioClient} 分开的原因：SigV4 的签名包含 Host，而服务端内网地址
     * （minio:9000）与浏览器实际请求的地址（localhost:9000 / oss.example.com）不同。
     * 两者都显式设置 region，避免 minio-java 对公网 endpoint 发 GetBucketLocation。
     * {@code publicEndPoint} 为空时两者是同一个实例，等价于旧行为。
     */
    private final MinioClient presignClient;

    private String getOriginalObjectName(String objectName) {
        return StringUtils.format("{}/{}", this.minIOConfig.getBasePath(), objectName);
    }



    public MinIOFilePlugin(MinIOConfig config) {
        minIOConfig = config;
        String region = StringUtils.isEmpty(config.getRegion()) ? DEFAULT_REGION : config.getRegion();
        minioClient = MinioClient.builder()
                .endpoint(config.getEndPoint())
                .region(region)
                .credentials(config.getAccessKey(), config.getSecretKey())
                .build();
        presignClient = StringUtils.isEmpty(config.getPublicEndPoint())
                ? minioClient
                : MinioClient.builder()
                        .endpoint(config.getPublicEndPoint())
                        .region(region)
                        .credentials(config.getAccessKey(), config.getSecretKey())
                        .build();
    }

    @Override
    public String upload(ByteArrayInputStream inputStream, long size, String objectName) {
//        List<SnowballObject> objects = new ArrayList<>();
//        objects.add(new SnowballObject(getOriginalObjectName(objectName), inputStream, size, null));
        try {
            this.minioClient.putObject(PutObjectArgs.builder()
                    .bucket(this.minIOConfig.getBucketName())
                            .object(getOriginalObjectName(objectName))
                            .stream(inputStream, -1, 10485760)
                    .build());
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            throw new BusinessException("上传失败");
        }
        return objectName;
    }

    @Override
    public OssTypeEnum getPluginOssType() {
        return OssTypeEnum.MIN_IO;
    }

    @Override
    public String multipartFileUpload(MultipartFile file, String path, String fileName) {
        // 服务端中转上传（PDF 转存 / Whisper / 封面）在 MIN_IO 下走这里。
        // MinIO 没有永久 URL，因此统一返回 objectName（写进 FilePO.objectName），
        // 由 file 的 objects/{fileId}/redirect 端点换成新鲜预签名 URL。
        String objectName = StringUtils.format("{}/{}", path, fileName);
        try (InputStream inputStream = file.getInputStream()) {
            this.minioClient.putObject(PutObjectArgs.builder()
                    .bucket(this.minIOConfig.getBucketName())
                    .object(getOriginalObjectName(objectName))
                    .stream(inputStream, file.getSize(), -1)
                    .contentType(StringUtils.isEmpty(file.getContentType())
                            ? "application/octet-stream" : file.getContentType())
                    .build());
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            throw new BusinessException(StringUtils.format("上传文件\"{}\"失败", fileName));
        }
        return objectName;
    }

    @Override
    public OSSSignature getOssSignature(Integer durationSeconds, String objectName) {
        String preSignedObjectUrl = this.getPreSignedObjectUrl(objectName, Method.PUT, 3600, TimeUnit.SECONDS);
        return OSSSignature.builder()
                .type(OSSSignatureType.MIN_IO)
                .credentials(MinIOSignatureData.builder()
                        .url(preSignedObjectUrl)
                        .build())
                .build();
    }

    /**
     * 获取MinIO PreSignedObject Url
     * <p>
     * 必须走 {@link #presignClient}：签名里的 Host 要与浏览器实际请求的 Host 一致。
     * 已显式设置 region，因此这里是纯本地计算，不发任何网络请求。
     * @param objectName 对象名称
     * @param method 方法
     * @param duration 过期时间
     * @param unit 过期时间单位
     * @return 预签名URL
     */
    private String getPreSignedObjectUrl(String objectName, Method method, Integer duration, TimeUnit unit) {
        try {
            String url = presignClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(method)
                    .bucket(this.minIOConfig.getBucketName())
                    .object(StringUtils.format("{}/{}", this.minIOConfig.getBasePath(), objectName))
                    .expiry(duration, unit)
                    .build());
            log.info("PreSignedObjectUrl: {}", url);
            return url;
        } catch (Exception e) {
            log.error("Get MinIO Upload signature failed，message: {}", e.getMessage(), e);
            throw new BusinessException("获取上传签名失败", e);
        }

    }

    private String getPolicy(String bucketsName, String objectName) {

        String policy = "{\n" +
                " \"Version\": \"2012-10-17\",\n" +
                " \"Statement\": [\n" +
                "  {\n" +
                "   \"Effect\": \"Allow\",\n" +
                "   \"Action\": [\n" +
                "    \"s3:ListBucket\"\n" +
                "   ],\n" +
                "   \"Resource\": [\n" +
                "    \"arn:aws:s3:::companybucket\"\n" +
                "   ]\n" +
                "  },\n" +
                "  {\n" +
                "   \"Sid\": \"AllowUserToReadWriteObjectData\",\n" +
                "   \"Effect\": \"Allow\",\n" +
                "   \"Action\": [\n" +
                "    \"s3:GetObject\",\n" +
                "    \"s3:PutObject\"\n" +
                "   ],\n" +
                "   \"Resource\": [\n" +
                "    \"arn:aws:s3:::companybucket/Development/*\"\n" +
                "   ]\n" +
                "  },\n" +
                "  {\n" +
                "   \"Sid\": \"ExplicitlyDenyAnyRequestsForAllOtherFoldersExceptDevelopment\",\n" +
                "   \"Effect\": \"Deny\",\n" +
                "   \"Action\": [\n" +
                "    \"s3:ListBucket\"\n" +
                "   ],\n" +
                "   \"Resource\": [\n" +
                "    \"arn:aws:s3:::companybucket\"\n" +
                "   ],\n" +
                "   \"Condition\": {\n" +
                "    \"Null\": {\n" +
                "     \"s3:prefix\": [\n" +
                "      false\n" +
                "     ]\n" +
                "    },\n" +
                "    \"StringNotLike\": {\n" +
                "     \"s3:prefix\": [\n" +
                "      \"Development/*\",\n" +
                "      \"\"\n" +
                "     ]\n" +
                "    }\n" +
                "   }\n" +
                "  }\n" +
                " ]\n" +
                "}";
//        String policy =
//                "{\n" +
//                " \"Version\": \"2012-10-17\",\n" +
//                " \"Statement\": [\n" +
//                "  {\n" +
//                "   \"Effect\": \"Allow\",\n" +
//                "   \"Action\": [\n" +
//                "    \"s3:GetObject\",\n" +
//                //"    \"s3:GetBucketLocation\",\n" +
//                "    \"s3:PutObject\"\n" +
//                "   ],\n" +
//                "   \"Resource\": [\n" +
//                        "\"arn:aws:s3:::anynote/Development/*\"\n" +
//                //"    \"arn:aws:s3:::" + bucketsName + "/userA/*\"\n" +
//                "   ]\n" +
////                "   \"Condition\": {\"StringEquals\": {\"s3:ExistingObjectTag/environment\": \"${aws:username}\"}}\n"+
//                "  }\n" +
//                " ]\n" +
//                "}";
//        String policy = "{\n" +
//                "    \"Version\": \"2012-10-17\",\n" +
//                "    \"Statement\": [\n" +
//                "        {\n" +
//                "            \"Effect\": \"Allow\",\n" +
//                "            \"Action\": [\"s3:GetObject\", \"s3:GetBucketLocation\"],\n" +
//                "            \"Resource\": [\"arn:aws:s3:::anynote/*\"]\n" +
//                "        },\n" +
//                "        {\n" +
//                "            \"Effect\": \"Allow\",\n" +
//                "            \"Action\": [\"s3:PutObject\"],\n" +
//                "            \"Resource\": [\"arn:aws:s3:::anynote/*\"],\n" +
//                "            \"Condition\": {\"StringEquals\": {\"s3:x-amz-meta-uploader\": \"${aws:username}\"}}\n" +
//                "        }\n" +
//                "    ]\n" +
//                "}";
        log.info("minio sts policy :\n {}", policy);
        return policy;
    }

    private Credentials getMinIOCredentials(Integer durationSeconds, String objectName) {
        AssumeRoleProvider provider = null;
        try {
             provider = new AssumeRoleProvider(
                    this.minIOConfig.getEndPoint(),
                    this.minIOConfig.getAccessKey(),
                    this.minIOConfig.getSecretKey(),
                    durationSeconds,
//                     "{\n" +
//                             " \"Version\": \"2012-10-17\",\n" +
//                             " \"Statement\": [\n" +
//                             "  {\n" +
//                             "   \"Effect\": \"Allow\",\n" +
//                             "   \"Action\": [\n" +
//                             "    \"s3:GetObject\",\n" +
//                             "    \"s3:GetBucketLocation\",\n" +
//                             "    \"s3:PutObject\"\n" +
//                             "   ],\n" +
//                             "   \"Resource\": [\n" +
//                             "    \"arn:aws:s3:::" + objectName + "\"\n" +
//                             "   ]\n" +
//                             "  }\n" +
//                             " ]\n" +
//                             "}",
                     getPolicy(this.minIOConfig.getBucketName() ,objectName),
                    null,
                    "testAnynoteUser",
                    "testAnynoteUser",
                    null,
                    null
            );
        } catch (NoSuchAlgorithmException e) {
            log.error(e.getMessage(), e);
            throw new BusinessException("获取文件临时token失败");
        }
        Credentials credentials = provider.fetch();
        System.out.println(credentials.accessKey());
        System.out.println(credentials.secretKey());
        System.out.println(credentials.sessionToken());
        System.out.println(credentials.isExpired());
        return credentials;
    }

    @Override
    public FileDTO sliceUpload(MultipartFile file, String hash, String objectName) {

        return null;
    }

    @Override
    public OssSliceUploadTaskInfo createOssSliceUploadTask(String hash, Double fileSize, String path,
                                                           String objectName, String uploadId) {
        // 单位是MB
        int chunkSize = Math.max(5, (int)Math.ceil(fileSize / 1000));
        // 分片数量
        int chunkCount = (int) Math.ceil((double) fileSize / chunkSize);
        return OssSliceUploadTaskInfo.builder()
                .ossType(OssTypeEnum.MIN_IO.name())
                .totalChunk(chunkCount)
                .chunkSize(chunkSize)
                .chunkFolder(StringUtils.format("{}/{}", path, uploadId))
                .objectName(objectName)
                .build();
    }

    @Override
    public boolean exist(String objectName) throws ServerException, InsufficientDataException, ErrorResponseException, IOException, NoSuchAlgorithmException, InvalidKeyException, InvalidResponseException, XmlParserException, InternalException {
        return minioClient.statObject(StatObjectArgs.builder()
                .bucket(this.minIOConfig.getBucketName())
                .object(StringUtils.format("{}/{}", this.minIOConfig.getBasePath(), objectName))
                .build()) != null;
    }

    @Override
    public OssObjectComposeResponse composeOssSliceUploadObject(List<String> objectNameList, String targetObjectName) {
        List<ComposeSource> sources = objectNameList.stream()
                .map(objectName -> ComposeSource.builder()
                        .bucket(this.minIOConfig.getBucketName())
                        .object(StringUtils.format("{}/{}", this.minIOConfig.getBasePath(), objectName))
                        .build())
                .collect(Collectors.toList());
        try {
            ObjectWriteResponse objectWriteResponse = this.minioClient.composeObject(ComposeObjectArgs.builder()
                    .bucket(this.minIOConfig.getBucketName())
                    .object(StringUtils.format("{}/{}", this.minIOConfig.getBasePath(), targetObjectName))
                    .sources(sources)
                    .build());
            return OssObjectComposeResponse.builder()
                    .hash(objectWriteResponse.etag())
                    .build();
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            throw new BusinessException(StringUtils.format("合并文件：\"{}\"失败", targetObjectName));
        }
    }


    @Override
    public void removeObjects(List<String> objectNameList) {
        if (objectNameList == null || objectNameList.isEmpty()) {
            return;
        }
        // 尽力而为：分片残留不应让已经成功的上传对用户暴露为失败。
        for (String objectName : objectNameList) {
            try {
                this.minioClient.removeObject(RemoveObjectArgs.builder()
                        .bucket(this.minIOConfig.getBucketName())
                        .object(getOriginalObjectName(objectName))
                        .build());
            } catch (Exception e) {
                log.warn("删除分片对象\"{}\"失败：{}", getOriginalObjectName(objectName), e.getMessage());
            }
        }
    }

    @Override
    public ObjectURL getObjectUrl(String objectName, Integer durationSeconds) {
        // 获取当前时间
        Date currentDate = new Date();
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(currentDate);
        calendar.add(Calendar.SECOND, durationSeconds);
        String url = getPreSignedObjectUrl(objectName, Method.GET ,durationSeconds, TimeUnit.SECONDS);

        return ObjectURL.builder()
                .url(url)
                .expireTime(calendar.getTime())
                .build();
    }


    @Override
    public String downloadObject(String objectName, String savePath) {
        Path folderPath = Paths.get(savePath);
        if (!Files.exists(folderPath)) {
            throw new BusinessException("文件目录不存在");
        }
        try {
            if (!exist(objectName)) {
                throw new BusinessException(StringUtils.format("文件对象\"{}\"不存在", getOriginalObjectName(objectName)));
            }
            String extension = FilenameUtils.getExtension(objectName);
            Path filePath = folderPath.resolve(StringUtils.format("{}.{}", UUID.randomUUID().toString(),
                    extension));
            try (InputStream inputStream = this.minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(this.minIOConfig.getBucketName())
                            .object(getOriginalObjectName(objectName))
                            .build()
            )) {
                Files.copy(inputStream, filePath);
            }
            return filePath.toAbsolutePath().toString();
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            throw new BusinessException(StringUtils.format("下载文件对象\"{}\"失败"));
        }
    }

    @Override
    public String readTextFile(String objectName) {
        StringBuilder sb = new StringBuilder();
        try (InputStream inputStream = minioClient.getObject(GetObjectArgs.builder()
                .bucket(minIOConfig.getBucketName())
                .object(getOriginalObjectName(objectName))
                .build())) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        } catch (IOException | ErrorResponseException | InsufficientDataException | InternalException |
                 InvalidKeyException | InvalidResponseException | NoSuchAlgorithmException | ServerException |
                 XmlParserException e) {
            throw new RuntimeException(e);
        }
        return sb.toString();
    }
}
