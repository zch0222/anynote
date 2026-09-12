package com.anynote.file.model.bo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * MinIO配置
 * @author 称霸幼儿园
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class MinIOConfig {

    private static final long serialVersionUID = 2975271656230801861L;

    /**
     * 服务端自己调用 MinIO 用的地址（stat / compose / get / put）。
     * 必须是 Docker 内网可达地址（如 http://minio:9000）；填公网名会让服务端调用绕公网。
     */
    private String endPoint;

    /**
     * **只用于生成预签名 URL** 的浏览器可达地址，如 http://localhost:9000 或 https://oss.example.com。
     * <p>
     * SigV4 把 Host 计入签名，签名用的 host 必须与浏览器实际请求的 host 一致，
     * 否则 MinIO 返回 SignatureDoesNotMatch。为空时回落到 {@link #endPoint}，兼容旧配置。
     * <p>
     * endpoint 不能带路径（minio-java 的 HttpUtils 会报 "no path allowed in endpoint"），
     * 所以不能用 https://域名/oss/ 子路径反代，必须是独立主机名。
     */
    private String publicEndPoint;

    /**
     * 服务端 region，须与 MinIO 的 MINIO_SITE_REGION 一致，默认 us-east-1。
     * <p>
     * 必须显式设置：region 未知时 minio-java 会对 endpoint 发一次 GetBucketLocation；
     * presignClient 指向公网地址，触发该调用就变成"服务端必须能访问公网入口"。
     * 设了 region 后 getPresignedObjectUrl 是纯本地计算，不发网络请求。
     */
    private String region;

    private String accessKey;

    private String secretKey;

    /**
     * 桶名称
     */
    private String bucketName;

    /**
     * 根路径
     */
    private String basePath;

}
