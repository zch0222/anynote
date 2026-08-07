package com.anynote.file.test;

import com.anynote.file.api.model.bo.OSSSignature;
import com.anynote.file.factory.FilePluginFactory;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import jakarta.annotation.Resource;

/**
 * 集成测试：需要 MinIO / Nacos 就绪才能运行。
 * 默认被 surefire 的 excludedGroups=integration 跳过，
 * 起好中间件后用 mvn test -pl file -am -Dtest.excluded.groups= 单独执行。
 */
@Tag("integration")
@SpringBootTest
public class TestMinIOFilePlugin {

    @Resource
    private FilePluginFactory filePluginFactory;

    @Test
    public void test() {
        OSSSignature signature = filePluginFactory.filePlugin().getOssSignature(3600, "Java编程思想（第4版） (计算机科学丛书，Java学习必读经典,殿堂级著作！赢得了全球程序员的广泛赞誉！) (Bruce Eckel [Eckel, Bruce]) (Z-Library).epub");
        System.out.println(signature);
    }
}
