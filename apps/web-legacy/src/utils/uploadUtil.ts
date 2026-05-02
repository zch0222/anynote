import {getOssSliceUploadSignature, getOssSliceUploadTaskInfo, markOssUploadSlice, ossSliceUploadComposeObject} from "@/requests/client/file/oss";
import { OssSliceUploadTaskVO, SignatureInfo, OssSliceUploadChunkMarkVO, OssSliceUploadComposeOV } from "@/types/fileTypes";
import axios from "axios";
import {tree} from "d3-hierarchy";

export interface CallbackFunction {
    (percent: number, isDone: boolean, ossSliceUploadComposeOV: OssSliceUploadComposeOV | null): void
}

/**
 * 分片上传方法
 * @param uploadId 文件上传ID
 * @param file 文件
 * @param callback 文件上传回调，返回进度
 */
export function upload(uploadId: string, file: File, callback: CallbackFunction) {
    console.log(uploadId)
    getOssSliceUploadTaskInfo(uploadId)
        .then(
            res => {
                const data = res.data.data;
                console.log(data)
                if (data.finishedChunks.length === data.totalChunk) {
                    callback(100, false, null)
                    return;
                }
                else {
                    startUpload(data, file, callback).then(r => null);
                }
            }
        )
}

function getFileChunks(file: File, chunkSize: number) {
    let offset = 0
    const chunks = []
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize * 1024 * 1024);
        chunks.push(chunk);
        offset = offset + chunkSize * 1024 * 1024;
    }
    return chunks;
}

async function startUpload(data: OssSliceUploadTaskVO, file: File, callback: CallbackFunction) {
    let finishedChunks = data.finishedChunks;
    const totalChunk = data.totalChunk;
    const chunks = getFileChunks(file, data.chunkSize);
    async function processChunks() {
        if (finishedChunks.length === totalChunk) {
            return; // 所有切片已完成
        }

        const signatureResponse = await getSignature(data.uploadId, finishedChunks, totalChunk);
        const uploadResponse = await uploadChunks(chunks, signatureResponse.data.data.signatures);

        const markResponse = await markOssUploadSlice({
            uploadId: data.uploadId,
            chunkIndexList: uploadResponse
        });

        // 更新已完成的切片索引
        markResponse.data.data.markedIndexList.forEach(index => finishedChunks.push(index));
        callback(finishedChunks.length / totalChunk, false, null); // 更新进度

        await processChunks(); // 递归调用
    }

    await processChunks(); // 开始处理

    ossSliceUploadComposeObject({uploadId: data.uploadId})
        .then(res => {
            console.log(res.data)
            callback(100, true, res.data.data)
        })

}

function getSignature(uploadId: string, finishedChunks: number[], totalChunk: number) {
    const chunks = new Set<number>();
    for (let i = 1; i <= totalChunk; ++i) {
        if (chunks.size == 5) {
            break;
        }
        if (!finishedChunks.includes(i)) {
            chunks.add(i);
        }
    }
    // debugger
    return getOssSliceUploadSignature({
        uploadId: uploadId,
        chunkIndexList: Array.from(chunks)
    })
}

async function uploadChunks(chunks: Blob[], signatures: SignatureInfo[]): Promise<number[]> {
    const finishedIndexList: number[] = [];
    for (let i = 0; i < signatures.length; ++i) {
        const signature = signatures[i];
        const url = signature.signature.credentials.url;
        const index = signature.index
        try {
            const response = await axios.put(url, chunks[index-1]);
            if (response.status == 200) {
                console.log(`upload INDEX: ${index} SUCCESS`);
                finishedIndexList.push(index);
            }
            else {
                throw new Error(`upload INDEX: ${index} ERROR: ${response.status}`)
            }
        } catch (error) {
            console.error('UPLOAD FAILED:', error);
        }
    }
    return finishedIndexList
}


