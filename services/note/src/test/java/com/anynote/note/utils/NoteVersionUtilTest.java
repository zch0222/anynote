package com.anynote.note.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 笔记版本号工具单测
 *
 * @author 称霸幼儿园
 */
class NoteVersionUtilTest {

    @Test
    @DisplayName("版本号是更新时间的毫秒时间戳字符串")
    void toVersionUsesEpochMilli() {
        assertEquals("1757520000000", NoteVersionUtil.toVersion(new Date(1757520000000L)));
    }

    @Test
    @DisplayName("更新时间为空时没有可比对的版本")
    void toVersionReturnsNullForNullDate() {
        assertNull(NoteVersionUtil.toVersion(null));
    }

    @Test
    @DisplayName("客户端不带版本号表示放弃冲突检测")
    void blankClientVersionIsNeverStale() {
        assertFalse(NoteVersionUtil.isStale(null, "1757520000000"));
        assertFalse(NoteVersionUtil.isStale("", "1757520000000"));
        assertFalse(NoteVersionUtil.isStale("   ", "1757520000000"));
    }

    @Test
    @DisplayName("版本号一致时放行")
    void matchingVersionIsNotStale() {
        assertFalse(NoteVersionUtil.isStale("1757520000000", "1757520000000"));
    }

    @Test
    @DisplayName("版本号不一致时判定为过期")
    void differentVersionIsStale() {
        assertTrue(NoteVersionUtil.isStale("1757520000000", "1757520001000"));
    }

    @Test
    @DisplayName("服务端没有版本而客户端带了版本，同样判定为过期")
    void clientVersionAgainstMissingServerVersionIsStale() {
        assertTrue(NoteVersionUtil.isStale("1757520000000", null));
    }
}
