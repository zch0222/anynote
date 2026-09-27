package com.anynote.note.model.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link CollabSnapshotSaveDTO} 的字段校验单测。
 *
 * @author 称霸幼儿园
 */
class CollabSnapshotSaveDTOTest {

    private static final String EPOCH = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";

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

    private static CollabSnapshotSaveDTO valid() {
        return new CollabSnapshotSaveDTO("标题", "# 标题", "AQI=", EPOCH, "1790265600000", 7L);
    }

    private static Set<String> violatedFields(CollabSnapshotSaveDTO dto) {
        return validator.validate(dto).stream()
                .map(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .collect(Collectors.toSet());
    }

    @Test
    @DisplayName("合法请求体通过校验；标题与操作者可以为空")
    void acceptsValidBody() {
        assertTrue(violatedFields(valid()).isEmpty());
        CollabSnapshotSaveDTO dto = valid();
        dto.setTitle(null);
        dto.setOperatorId(null);
        assertTrue(violatedFields(dto).isEmpty());
    }

    @Test
    @DisplayName("标题超过 80 字被拒绝")
    void rejectsLongTitle() {
        CollabSnapshotSaveDTO dto = valid();
        dto.setTitle("标".repeat(81));
        assertEquals(Set.of("title"), violatedFields(dto));
    }

    @Test
    @DisplayName("正文、状态、谱系与基准版本号缺失时被拒绝")
    void rejectsMissingRequiredFields() {
        CollabSnapshotSaveDTO dto = new CollabSnapshotSaveDTO();
        assertEquals(Set.of("content", "state", "epoch", "baseVersion"), violatedFields(dto));
    }

    @Test
    @DisplayName("谱系不是 36 位、基准版本号不是数字时被拒绝")
    void rejectsMalformedEpochAndVersion() {
        CollabSnapshotSaveDTO dto = valid();
        dto.setEpoch("short");
        dto.setBaseVersion("v1");
        Set<String> fields = violatedFields(dto);
        assertTrue(fields.contains("epoch"));
        assertTrue(fields.contains("baseVersion"));
    }

    @Test
    @DisplayName("toString 不输出正文与状态，避免请求日志被大字段撑爆")
    void toStringOmitsLargeFields() {
        String text = valid().toString();
        assertFalse(text.contains("AQI="));
        assertFalse(text.contains("# 标题"));
    }
}
