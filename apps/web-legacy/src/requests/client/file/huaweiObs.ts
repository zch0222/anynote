import request, {Method} from "@/utils/client-request"
import fs from 'fs';
import {HuaweiOBSTemporarySignature} from "@/types/fileTypes";
import * as urlLib from 'url';
import * as http from "http";
import axios from "axios";
import { AxiosProgressEvent, AxiosRequestConfig } from "axios";

export async function uploadFile(params: {
    signature: HuaweiOBSTemporarySignature,
    fileArrayBuffer: string | ArrayBuffer | null,
    contentType: string,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
}) {

    const {fileArrayBuffer, signature, contentType} = params

    const reopt: AxiosRequestConfig = {
        method: "PUT",
        url: params.signature.signedUrl,
        withCredentials: false,
        headers: {
            "Content-Type": contentType
        },
        validateStatus: function (status: number) {
            return status >= 200;
        },
        maxRedirects: 0,
        responseType: 'text',
        data: fileArrayBuffer,
        onUploadProgress: params.onUploadProgress
    };

    // @ts-ignore
    try {
        const response = await axios.request(reopt);
        if (response.status < 300) {
            console.log('Creating object using temporary signature succeed.');
        } else {
            console.log('Creating object using temporary signature failed!');
            console.log('status:' + response.status);
            console.log('\n');
        }
        console.log(response.data);
        console.log('\n');
    } catch (err) {
        console.log('Creating object using temporary signature failed!');
        console.log(err);
        console.log('\n');
    }
}

    // return new Promise((resolve, reject) => {
    //     const reader = new FileReader();
    //     reader.onload = () => {
    //         const arrayBuffer = reader.result;
    //
    //     reader.onerror = (error) => reject(error)
    // })



    // const url = urlLib.parse(params.signature.signedUrl)
    //
    // var req = http.request({
    //     method : "PUT",
    //     host : url.hostname,
    //     port : url.port,
    //     path : url.path,
    //     rejectUnauthorized : false,
    //     headers : params.signature.actualSignedRequestHeaders
    // });
    //
    // req.on('response',   (serverback) => {
    //     var buffers = [];
    //     serverback.on('data', (data) => {
    //         buffers.push(data);
    //     }).on('end', () => {
    //
    //         if(serverback.statusCode < 300){
    //             console.log('Creating object using temporary signature succeed.');
    //         }else{
    //             console.log('Creating object using temporary signature failed!');
    //             console.log('status:' + serverback.statusCode);
    //             console.log('\n');
    //         }
    //         buffers = Buffer.concat(buffers);
    //         if(buffers.length > 0){
    //             console.log(buffers.toString());
    //         }
    //         console.log('\n');
    //     });
    // }).on('error',(err) => {
    //     console.log('Creating object using temporary signature failed!');
    //     console.log(err);
    //     console.log('\n');
    // });
    //
    // if(params.fileArrayBuffer){
    //     req.write(params.fileArrayBuffer);
    // }
    // req.end();

    // request<any>({
    //     url: params.signature.signedUrl,
    //     method: Method.PUT,
    //     data: params.fileArrayBuffer,
    //     needToken: false,
    //     headers: {
    //         "Content-Type": params.contentType
    //     },
    //     withCredentials: false
    // })
    // return new Promise((resolve, reject) => {
    //     const reader = new FileReader();
    //     reader.readAsArrayBuffer(params.file);
    //     reader.onload = () => {
    //         const arrayBuffer = reader.result;
    //         // var reopt = {
    //         //     method : "PUT",
    //         //     url : params.signature.signedUrl,
    //         //     withCredentials: false,
    //         //     headers : {
    //         //         "Content-Type": params.file.type
    //         //     },
    //         //     validateStatus: function(status){
    //         //         return status >= 200;
    //         //     },
    //         //     maxRedirects : 0,
    //         //     responseType : 'text',
    //         //     data : arrayBuffer,
    //         // };
    //         //
    //         // axios.request(reopt).then(function (response) {
    //         //     if(response.status < 300){
    //         //         console.log('Creating object using temporary signature succeed.');
    //         //     }else{
    //         //         console.log('Creating object using temporary signature failed!');
    //         //         console.log('status:' + response.status);
    //         //         console.log('\n');
    //         //     }
    //         //     console.log(response.data);
    //         //     console.log('\n');
    //         // }).catch(function (err) {
    //         //     console.log('Creating object using temporary signature failed!');
    //         //     console.log(err);
    //         //     console.log('\n');
    //         // });
    //         resolve(
    //
    //         );
    //     };
    //     reader.onerror = error => {
    //         console.log(error)
    //         reject(error)
    //     };
    // });

    // const formData = new FormData()
    // formData.append("file", params.file)
    // return  request<null>({
    //     url: params.url,
    //     method: Method.PUT,
    //     data: formData,
    //     needToken: false,
    //     headers: {
    //         'Content-Type': params.file.type
    //     }
    // })
