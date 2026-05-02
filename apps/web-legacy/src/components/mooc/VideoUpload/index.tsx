import React from 'react';
import type {UploadProps} from 'antd';
import {message, Upload} from 'antd';
import {InboxOutlined} from '@ant-design/icons';
import {RcFile} from "antd/es/upload";
import {createMoocVidoUploadTask} from "@/requests/client/note/mooc";
import {upload} from "@/utils/uploadUtil";

const {Dragger} = Upload;
interface VideoUploadProps {
    moocId: number;
    setVideoName: (name: string) => void;
}

const VideoUpload: React.FC<VideoUploadProps> = ({moocId, setVideoName}) => {

    const beforeUpload = (file: RcFile) => {
        const isVideo = file.type.startsWith('video/');
        if (!isVideo) {
            message.error('只能上传视频文件！');
            return false;
        }
        const isLt2G = file.size / 1024 / 1024 / 1024 < 2;
        if (!isLt2G) {
            message.error('视频大小不能超过 2GB！');
            return false;
        }
        return true;
    }

    const uploadVideo = (option: any) => {
        const {file} = option

        createMoocVidoUploadTask({
            fileName: file.name,
            hash: "TEST",
            fileSize: file.size / 1024 / 1024,
            contentType: file.type,
            moocId: moocId
        }).then(res => {
            const data = res.data.data;
            upload(data.uploadId, file, (percent: number, isDone: boolean, ossSliceUploadComposeOV) => {
                if (isDone && ossSliceUploadComposeOV) {
                    setVideoName(ossSliceUploadComposeOV.objectName)
                } else {
                    console.log("PERCENT:" + percent)
                }
            });
        })
    }

    return (
        <Dragger
            showUploadList={false}
            beforeUpload={beforeUpload}
            customRequest={uploadVideo}
        >
            <p className="ant-upload-drag-icon">
                <InboxOutlined/>
            </p>
            <p className="ant-upload-text">点击或拖拽视频文件到此区域上传</p>
            <p className="ant-upload-hint">
                支持单个视频文件上传，大小不超过 2GB
            </p>
        </Dragger>
    );
};

export default VideoUpload;
