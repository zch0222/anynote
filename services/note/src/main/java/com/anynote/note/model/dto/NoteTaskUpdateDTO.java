package com.anynote.note.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Date;

/**
 * @author 称霸幼儿园
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class NoteTaskUpdateDTO {

    /**
     * 笔记任务id
     */
    private Long id;

    /**
     * 任务名称
     */
    @Size(max = 20, min = 1, message = "任务名称长度必须在1-20个字符")
    private String taskName;

    private Date startTime;

    private Date endTime;

    private String taskDescribe;
}
