package com.anynote.auth.model.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.core.converter.ModelConverters;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class LogoutDTOTest {

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

    private static LogoutDTO dto(String at, String rt) {
        LogoutDTO dto = new LogoutDTO();
        dto.setAccessToken(at);
        dto.setRefreshToken(rt);
        return dto;
    }

    @ParameterizedTest
    @CsvSource(value = {"at,rt", "at,NULL", "at,''", "at,'   '", "NULL,rt", "'',rt", "'   ',rt"}, nullValues = "NULL")
    @DisplayName("任意一个 token 非空白即可通过请求校验")
    void allowsEitherToken(String at, String rt) {
        assertThat(validator.validate(dto(at, rt))).isEmpty();
    }

    @ParameterizedTest
    @CsvSource(value = {"NULL,NULL", "NULL,''", "'',NULL", "'',''", "'   ','   '", "NULL,'   '", "'   ',NULL"}, nullValues = "NULL")
    @DisplayName("两个 token 都缺失或空白时拒绝请求")
    void rejectsBothBlank(String at, String rt) {
        assertThat(validator.validate(dto(at, rt))).isNotEmpty();
    }

    @Test
    @DisplayName("校验辅助属性不进入 JSON")
    void serializesOnlyTokenFields() {
        var json = new ObjectMapper().valueToTree(dto("at", "rt"));
        assertThat(json.size()).isEqualTo(2);
        assertThat(json.get("accessToken").asText()).isEqualTo("at");
        assertThat(json.get("refreshToken").asText()).isEqualTo("rt");
    }

    @Test
    @DisplayName("OpenAPI 两个凭据字段均可缺省，校验辅助属性不进入契约")
    void documentsBothTokensAsOptional() {
        var schema = ModelConverters.getInstance().readAll(LogoutDTO.class).get("LogoutDTO");
        assertThat(schema.getProperties()).containsOnlyKeys("accessToken", "refreshToken");
        assertThat(schema.getRequired()).isNullOrEmpty();
        assertThat(schema.getDescription()).contains("至少提供一个");
    }
}
