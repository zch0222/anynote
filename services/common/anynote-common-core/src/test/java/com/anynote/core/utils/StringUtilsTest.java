package com.anynote.core.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link StringUtils} 单元测试。全仓到处在用，重点覆盖容易踩的
 * 空值语义、负索引截取与驼峰/下划线互转。
 */
class StringUtilsTest {

    @Nested
    @DisplayName("空值判断")
    class Emptiness {

        @ParameterizedTest(name = "isEmpty([{0}]) == true")
        @NullSource
        @ValueSource(strings = {"", " ", "   ", "\t", "\n"})
        @DisplayName("null、空串与纯空白都算空")
        void emptyStrings(String value) {
            assertThat(StringUtils.isEmpty(value)).isTrue();
            assertThat(StringUtils.isNotEmpty(value)).isFalse();
        }

        @Test
        @DisplayName("⚠️ 本类的 isEmpty 会先 trim，语义等同 commons-lang3 的 isBlank 而非 isEmpty")
        void isEmptyTrimsUnlikeCommonsLang() {
            // 本类 extends org.apache.commons.lang3.StringUtils 并覆盖了 isEmpty(String)，
            // 父类的 isEmpty(" ") 是 false，这里是 true。混用两者会踩坑，故锁死该差异。
            assertThat(StringUtils.isEmpty(" ")).isTrue();
            assertThat(org.apache.commons.lang3.StringUtils.isEmpty(" ")).isFalse();
            assertThat(org.apache.commons.lang3.StringUtils.isBlank(" ")).isTrue();
        }

        @ParameterizedTest(name = "isEmpty([{0}]) == false")
        @ValueSource(strings = {"a", "  x  ", "0"})
        @DisplayName("含非空白字符才算非空")
        void nonEmptyStrings(String value) {
            assertThat(StringUtils.isEmpty(value)).isFalse();
            assertThat(StringUtils.isNotEmpty(value)).isTrue();
        }

        @Test
        @DisplayName("hasText 与 isNotEmpty 在本类中语义一致")
        void hasTextIgnoresWhitespace() {
            assertThat(StringUtils.hasText("  ")).isFalse();
            assertThat(StringUtils.hasText("")).isFalse();
            assertThat(StringUtils.hasText(null)).isFalse();
            assertThat(StringUtils.hasText(" a ")).isTrue();
        }

        @Test
        @DisplayName("集合 / 数组 / Map 的空判断")
        void containersEmptiness() {
            assertThat(StringUtils.isEmpty(Collections.emptyList())).isTrue();
            assertThat(StringUtils.isEmpty((List<?>) null)).isTrue();
            assertThat(StringUtils.isNotEmpty(List.of("a"))).isTrue();

            assertThat(StringUtils.isEmpty(new Object[0])).isTrue();
            assertThat(StringUtils.isEmpty((Object[]) null)).isTrue();
            assertThat(StringUtils.isNotEmpty(new Object[]{"a"})).isTrue();

            assertThat(StringUtils.isEmpty(Collections.emptyMap())).isTrue();
            assertThat(StringUtils.isEmpty((Map<?, ?>) null)).isTrue();
            assertThat(StringUtils.isNotEmpty(Map.of("k", "v"))).isTrue();
        }

        @Test
        @DisplayName("isNull / isNotNull")
        void nullChecks() {
            assertThat(StringUtils.isNull(null)).isTrue();
            assertThat(StringUtils.isNull("")).isFalse();
            assertThat(StringUtils.isNotNull(new Object())).isTrue();
        }
    }

    @Nested
    @DisplayName("nvl 默认值")
    class Nvl {

        @Test
        @DisplayName("null 时取默认值，否则取原值")
        void returnsDefaultOnlyForNull() {
            assertThat(StringUtils.nvl(null, "fallback")).isEqualTo("fallback");
            assertThat(StringUtils.nvl("value", "fallback")).isEqualTo("value");
            // 空串不是 null，不该被替换
            assertThat(StringUtils.nvl("", "fallback")).isEmpty();
        }
    }

    @Nested
    @DisplayName("trim")
    class Trim {

        @Test
        @DisplayName("null 归一成空串，而不是返回 null")
        void nullBecomesEmptyString() {
            assertThat(StringUtils.trim(null)).isEmpty();
            assertThat(StringUtils.trim("  a  ")).isEqualTo("a");
        }
    }

    @Nested
    @DisplayName("substring（支持负索引，越界不抛异常）")
    class Substring {

        @Test
        @DisplayName("单参：正索引正常截取")
        void positiveStart() {
            assertThat(StringUtils.substring("abcdef", 2)).isEqualTo("cdef");
            assertThat(StringUtils.substring("abcdef", 0)).isEqualTo("abcdef");
        }

        @Test
        @DisplayName("单参：负索引从末尾倒数")
        void negativeStart() {
            assertThat(StringUtils.substring("abcdef", -2)).isEqualTo("ef");
            // 倒数超出长度则从头开始，不抛异常
            assertThat(StringUtils.substring("abcdef", -99)).isEqualTo("abcdef");
        }

        @Test
        @DisplayName("单参：start 越界或 str 为 null 时返回空串")
        void outOfRangeReturnsEmpty() {
            assertThat(StringUtils.substring("abcdef", 99)).isEmpty();
            assertThat(StringUtils.substring(null, 1)).isEmpty();
        }

        @ParameterizedTest(name = "substring(\"abcdef\", {0}, {1}) == \"{2}\"")
        @CsvSource({
                "1, 3,  bc",
                "0, 6,  abcdef",
                "0, 99, abcdef",
                "-3, -1, de",
                "2, 2,  ''",
        })
        @DisplayName("双参：负索引与越界都被夹紧到合法区间")
        void twoArgVariants(int start, int end, String expected) {
            assertThat(StringUtils.substring("abcdef", start, end)).isEqualTo(expected);
        }

        @Test
        @DisplayName("双参：start > end 时返回空串而非抛异常")
        void startAfterEndReturnsEmpty() {
            assertThat(StringUtils.substring("abcdef", 4, 2)).isEmpty();
            assertThat(StringUtils.substring(null, 1, 2)).isEmpty();
        }
    }

    @Nested
    @DisplayName("驼峰 / 下划线互转")
    class NamingConversion {

        @ParameterizedTest(name = "toUnderScoreCase(\"{0}\") == \"{1}\"")
        @CsvSource({
                "helloWorld,  hello_world",
                "HelloWorld,  hello_world",
                "userName,    user_name",
                "user,        user",
                "'',          ''",
        })
        @DisplayName("驼峰转下划线")
        void camelToUnderScore(String input, String expected) {
            assertThat(StringUtils.toUnderScoreCase(input)).isEqualTo(expected);
        }

        @Test
        @DisplayName("toUnderScoreCase(null) 返回 null（不归一成空串）")
        void nullStaysNull() {
            assertThat(StringUtils.toUnderScoreCase(null)).isNull();
        }

        @ParameterizedTest(name = "convertToCamelCase(\"{0}\") == \"{1}\"")
        @CsvSource({
                "hello_world, HelloWorld",
                "user_name,   UserName",
                "user,        User",
        })
        @DisplayName("下划线转大驼峰")
        void underScoreToUpperCamel(String input, String expected) {
            assertThat(StringUtils.convertToCamelCase(input)).isEqualTo(expected);
        }

        @ParameterizedTest(name = "toCamelCase(\"{0}\") == \"{1}\"")
        @CsvSource({
                "hello_world, helloWorld",
                "user_name,   userName",
                "user,        user",
        })
        @DisplayName("下划线转小驼峰")
        void underScoreToLowerCamel(String input, String expected) {
            assertThat(StringUtils.toCamelCase(input)).isEqualTo(expected);
        }
    }

    @Nested
    @DisplayName("其它判断")
    class Misc {

        @Test
        @DisplayName("ishttp 识别 http / https 前缀")
        void detectsHttpLinks() {
            assertThat(StringUtils.ishttp("http://a.com")).isTrue();
            assertThat(StringUtils.ishttp("https://a.com")).isTrue();
            assertThat(StringUtils.ishttp("ftp://a.com")).isFalse();
            assertThat(StringUtils.ishttp("/local/path")).isFalse();
        }

        @Test
        @DisplayName("inStringIgnoreCase 忽略大小写匹配")
        void inStringIgnoresCase() {
            assertThat(StringUtils.inStringIgnoreCase("ABC", "abc", "def")).isTrue();
            assertThat(StringUtils.inStringIgnoreCase("xyz", "abc", "def")).isFalse();
            assertThat(StringUtils.inStringIgnoreCase(null, "abc")).isFalse();
        }

        @Test
        @DisplayName("containsAny 判断集合是否命中任一候选")
        void containsAnyElement() {
            List<String> collection = List.of("read", "write");

            assertThat(StringUtils.containsAny(collection, "write")).isTrue();
            assertThat(StringUtils.containsAny(collection, "delete", "read")).isTrue();
            assertThat(StringUtils.containsAny(collection, "delete")).isFalse();
            assertThat(StringUtils.containsAny(Collections.emptyList(), "read")).isFalse();
        }
    }
}
