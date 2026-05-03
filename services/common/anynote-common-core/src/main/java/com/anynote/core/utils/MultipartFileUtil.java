package com.anynote.core.utils;

import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

public class MultipartFileUtil {

    public static MultipartFile toMultipartFile(byte[] bytes, String fileName) {
        return new ByteArrayMultipartFile(bytes, fileName);
    }

    private static class ByteArrayMultipartFile implements MultipartFile {

        private final byte[] bytes;
        private final String fileName;

        ByteArrayMultipartFile(byte[] bytes, String fileName) {
            this.bytes = bytes;
            this.fileName = fileName;
        }

        @Override
        public String getName() {
            return fileName;
        }

        @Override
        public String getOriginalFilename() {
            return fileName;
        }

        @Override
        public String getContentType() {
            return "application/octet-stream";
        }

        @Override
        public boolean isEmpty() {
            return bytes == null || bytes.length == 0;
        }

        @Override
        public long getSize() {
            return bytes.length;
        }

        @Override
        public byte[] getBytes() {
            return bytes;
        }

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException, IllegalStateException {
            java.nio.file.Files.write(dest.toPath(), bytes);
        }
    }
}
