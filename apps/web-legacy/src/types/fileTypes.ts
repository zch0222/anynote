export interface HuaweiOBSTemporarySignature {
    signedUrl: string;
    actualSignedRequestHeaders: { [key: string]: string };
    uploadId: string
}

export interface ImageUploadTempLinkDTO {
    /**
     * 文件名称
     */
    fileName: string;

    /**
     * 图片类型
     */
    contentType: string;

    /**
     * 上传ID
     */
    uploadId: string;
}

export interface OssSliceUploadTaskCreateDTO {
    /**
     * 文件名
     */
    fileName: string;

    /**
     * 文件哈希
     */
    hash: string;

    /**
     * 文件大小
     */
    fileSize: number;

    /**
     * contentType
     */
    contentType: string;

    moocId?: number;
}

export interface OssSliceUploadTaskVO {
    /**
     * 上传任务的唯一标识
     */
    uploadId: string;

    /**
     * 原始文件名
     */
    originalFileName: string;

    /**
     * 文件名
     */
    fileName: string;

    /**
     * 文件大小
     */
    fileSize: number;

    /**
     * 分片大小
     */
    chunkSize: number;

    /**
     * 分片数量
     */
    totalChunk: number;

    /**
     * 文件哈希
     */
    hash: string;

    /**
     * 已经完成的分片编号
     */
    finishedChunks: number[];
}

export interface OssSliceUploadSignatureDTO {
    /**
     * 上传id
     */
    uploadId: string;

    /**
     * 需要的分片index
     */
    chunkIndexList: number[];
}

interface MinIOSignatureData {
    url: string,
    expirationDate: Date
}

interface OSSSignature {
    type: string,
    credentials: MinIOSignatureData
}

export interface SignatureInfo {
    /**
     * 分片索引
     */
    index: number;

    /**
     * 签名信息
     */
    signature: OSSSignature;
}
export interface OssSliceUploadSignatureVO {
    /**
     * 分片大小
     */
    chunkSize: number;

    /**
     * 分片数量
     */
    totalChunk: number

    /**
     * 文件哈希
     */
    hash: string

    /**
     * 签名
     */
    signatures: SignatureInfo[]
}

export interface OssSliceUploadChunkMarkVO {
    markedIndexList: number[]
}


export interface OssSliceUploadComposeOV {
    fileId: number;
    objectName: string;
    hash: string;
}


export interface OssSliceUploadComposeVO {
    /**
     * 文件id
     */
    fileId: number;

    /**
     * 对象名
     */
    objectName: string;

    /**
     * 文件md5
     */
    hash: string;
}

export interface ObjectURL {
    /**
     * 文件对象链接
     */
    url: string;

    /**
     * 链接过期时间
     */
    expireTime: Date
}



