package com.anynote.system.model.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link UpdateMyProfileDTO} 的字段校验单测（方案 §4 B-3）。
 *
 * <p>用 {@code jakarta.validation.Validator} 直接跑注解，不起 Spring 容器。
 * 空串邮箱 / 空串手机号是「清空」的合法取值，必须通过；非法值必须被拒。</p>
 *
 * @author 称霸幼儿园
 */
class UpdateMyProfileDTOTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    private static UpdateMyProfileDTO dto(String nickname, Integer sex, String email, String phoneNumber) {
        UpdateMyProfileDTO dto = new UpdateMyProfileDTO();
        dto.setNickname(nickname);
        dto.setSex(sex);
        dto.setEmail(email);
        dto.setPhoneNumber(phoneNumber);
        return dto;
    }

    private static Set<ConstraintViolation<UpdateMyProfileDTO>> validate(
            String nickname, Integer sex, String email, String phoneNumber) {
        return validator.validate(dto(nickname, sex, email, phoneNumber));
    }

    @Test
    @DisplayName("合法请求体通过校验")
    void acceptsValidPayload() {
        assertTrue(validate("小张", 1, "zhang@example.com", "13800000000").isEmpty());
    }

    @Test
    @DisplayName("空串邮箱通过（表示清空）")
    void acceptsEmptyEmail() {
        assertTrue(validate("小张", 2, "", null).isEmpty());
    }

    @Test
    @DisplayName("null 邮箱与 null 手机号通过（同样表示清空）")
    void acceptsNullContactFields() {
        assertTrue(validate("小张", 2, null, null).isEmpty());
    }

    @Test
    @DisplayName("空串手机号通过（表示清空）")
    void acceptsEmptyPhoneNumber() {
        assertTrue(validate("小张", 2, "", "").isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-an-email", "a@", "@b.com", "a b@c.com"})
    @DisplayName("非法邮箱被拒")
    void rejectsInvalidEmail(String email) {
        assertFalse(validate("小张", 2, email, null).isEmpty(), email + " 应当被拒");
    }

    @Test
    @DisplayName("超长昵称（31 位）被拒")
    void rejectsTooLongNickname() {
        String nickname = "昵".repeat(31);
        Set<ConstraintViolation<UpdateMyProfileDTO>> violations = validate(nickname, 2, null, null);

        assertFalse(violations.isEmpty());
        assertTrue(violations.stream().anyMatch(v -> v.getPropertyPath().toString().equals("nickname")));
    }

    @Test
    @DisplayName("30 位昵称刚好通过边界")
    void acceptsMaxLengthNickname() {
        assertTrue(validate("昵".repeat(30), 2, null, null).isEmpty());
    }

    @Test
    @DisplayName("空白昵称被拒（@NotBlank）")
    void rejectsBlankNickname() {
        assertFalse(validate("   ", 2, null, null).isEmpty());
        assertFalse(validate(null, 2, null, null).isEmpty());
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 3, 9})
    @DisplayName("sex 只允许 0/1/2，其余被拒")
    void rejectsSexOutOfRange(int sex) {
        assertFalse(validate("小张", sex, null, null).isEmpty(), "sex=" + sex + " 应当被拒");
    }

    @Test
    @DisplayName("sex = null 被拒（@NotNull）")
    void rejectsNullSex() {
        assertFalse(validate("小张", null, null, null).isEmpty());
    }

    @ParameterizedTest
    @CsvSource({"0", "1", "2"})
    @DisplayName("sex = 0 男 / 1 女 / 2 未知 都通过")
    void acceptsAllLegalSexValues(int sex) {
        assertTrue(validate("小张", sex, null, null).isEmpty(), "sex=" + sex + " 应当通过");
    }

    @ParameterizedTest
    @ValueSource(strings = {"1380000000", "138000000000", "23800000000", "1380000000a", "138 00000000"})
    @DisplayName("非法手机号被拒")
    void rejectsInvalidPhoneNumber(String phoneNumber) {
        assertFalse(validate("小张", 2, null, phoneNumber).isEmpty(), phoneNumber + " 应当被拒");
    }

    @Test
    @DisplayName("超长邮箱（51 位）被拒")
    void rejectsTooLongEmail() {
        String email = "a".repeat(40) + "@example.com"; // 52 位
        assertFalse(validate("小张", 2, email, null).isEmpty());
    }

    @Test
    @DisplayName("非法邮箱的 message 可直接展示给用户")
    void invalidEmailMessageIsUserFacing() {
        Set<ConstraintViolation<UpdateMyProfileDTO>> violations = validate("小张", 2, "bad", null);

        assertEquals(1, violations.size());
        assertEquals("邮箱格式不正确", violations.iterator().next().getMessage());
    }
}
