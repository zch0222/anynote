package com.anynote.system.model.dto;

import com.anynote.system.api.model.dto.AdminResetPasswordDTO;
import com.anynote.system.api.model.dto.UpdateSuperAdminDTO;
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
 * 管理员重置密码与教师重置密码规则校验
 *
 * @author 称霸幼儿园
 */
class AdminPasswordRuleDTOTest {

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

    private static AdminResetPasswordDTO adminResetDTO(String password) {
        AdminResetPasswordDTO dto = new AdminResetPasswordDTO();
        dto.setNewPassword(password);
        return dto;
    }

    private static ResetPasswordDTO teacherResetDTO(String password) {
        ResetPasswordDTO dto = new ResetPasswordDTO();
        dto.setUserId(1L);
        dto.setNewPassword(password);
        return dto;
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1*", "Abcdef1!", "Abcdef1@#"})
    @DisplayName("管理员重置密码允许特殊字符")
    void adminResetAllowsSpecialCharacters(String password) {
        assertThat(validator.validate(adminResetDTO(password))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1 *", "abcdef1*", "ABCDEF1*", "Abcdefg*", "Abcdef1234567890"})
    @DisplayName("管理员重置密码拒绝空格、缺失大小写数字与越界长度")
    void adminResetRejectsInvalidPasswords(String password) {
        assertThat(validator.validate(adminResetDTO(password))).isNotEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abcdef1*", "Abcdef1!"})
    @DisplayName("教师重置密码同步允许特殊字符")
    void teacherResetAllowsSpecialCharacters(String password) {
        assertThat(validator.validate(teacherResetDTO(password))).isEmpty();
    }

    @Test
    @DisplayName("教师重置密码拒绝空格")
    void teacherResetRejectsSpace() {
        assertThat(validator.validate(teacherResetDTO("Abcdef1 *"))).isNotEmpty();
    }

    @Test
    @DisplayName("超级管理员状态必填")
    void superAdminEnabledRequired() {
        UpdateSuperAdminDTO dto = new UpdateSuperAdminDTO();
        assertThat(validator.validate(dto)).isNotEmpty();
        dto.setEnabled(true);
        assertThat(validator.validate(dto)).isEmpty();
        dto.setEnabled(false);
        assertThat(validator.validate(dto)).isEmpty();
    }
}
