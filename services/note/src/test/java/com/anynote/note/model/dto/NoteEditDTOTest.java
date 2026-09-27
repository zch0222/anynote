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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link NoteEditDTO} 的字段校验单测。
 *
 * <p>{@code n_note.title} 是 {@code varchar(80)}，严格模式下超长标题会让整次保存（含正文）回滚，
 * 因此在入参处拒绝超长标题。</p>
 *
 * @author 称霸幼儿园
 */
class NoteEditDTOTest {

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

    private static NoteEditDTO withTitle(String title) {
        NoteEditDTO dto = new NoteEditDTO();
        dto.setTitle(title);
        dto.setContent("正文");
        return dto;
    }

    @Test
    @DisplayName("80 字以内的标题通过校验")
    void acceptsTitleWithinLimit() {
        assertTrue(validator.validate(withTitle("标".repeat(80))).isEmpty());
    }

    @Test
    @DisplayName("标题为空表示不修改标题，通过校验")
    void acceptsMissingTitle() {
        assertTrue(validator.validate(withTitle(null)).isEmpty());
    }

    @Test
    @DisplayName("超过 80 字的标题被拒绝，而不是在写库时整体回滚")
    void rejectsTitleOverLimit() {
        Set<ConstraintViolation<NoteEditDTO>> violations = validator.validate(withTitle("标".repeat(81)));

        assertEquals(1, violations.size());
        assertEquals("title", violations.iterator().next().getPropertyPath().toString());
    }
}
