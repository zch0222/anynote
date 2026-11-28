package com.anynote.auth.model.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 注册与自助改密密码规则校验
 *
 * @author 称霸幼儿园
 */
class PasswordRuleDTOTest {

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

    private static RegisterDTO registerDTO(String password) {
        RegisterDTO dto = new RegisterDTO();
        dto.setNickname("测试用户");
        dto.setUsername("tester01");
        dto.setPassword(password);
        dto.setSex(0);
        return dto;
    }

    private static ResetPasswordDTO resetPasswordDTO(String newPassword) {
        ResetPasswordDTO dto = new ResetPasswordDTO();
        dto.setOldPassword("OldPass1*");
        dto.setNewPassword(newPassword);
        return dto;
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1*", "Abcdef1!", "Abcdef1@#", "Abcdef12~"})
    @DisplayName("注册允许特殊字符")
    void registerAllowsSpecialCharacters(String password) {
        assertThat(validator.validate(registerDTO(password))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1 *", "abcdef1*", "ABCDEF1*", "Abcdefg*", "Abcdef1234567890"})
    @DisplayName("注册拒绝空格、缺失大小写数字与越界长度")
    void registerRejectsInvalidPasswords(String password) {
        assertThat(validator.validate(registerDTO(password))).isNotEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1*", "Abcdef1!"})
    @DisplayName("自助改密允许特殊字符")
    void resetPasswordAllowsSpecialCharacters(String password) {
        assertThat(validator.validate(resetPasswordDTO(password))).isEmpty();
    }

    @Test
    @DisplayName("自助改密拒绝空格")
    void resetPasswordRejectsSpace() {
        assertThat(validator.validate(resetPasswordDTO("Abcdef1 *"))).isNotEmpty();
    }
}
