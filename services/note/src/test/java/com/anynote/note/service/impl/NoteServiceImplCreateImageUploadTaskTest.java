package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.enums.FileSources;
import com.anynote.file.api.model.dto.OssSliceUploadTaskCreateDTO;
import com.anynote.file.api.model.dto.OssSliceUploadTaskCreatePublicDTO;
import com.anynote.file.api.model.vo.OssSliceUploadTaskVO;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.model.bo.NoteImageUploadTaskCreateParam;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link NoteServiceImpl#createNoteImageUploadTask} 的纯单测。
 * <p>
 * 这条端点的安全要点是 path / source 由服务端决定（§2.2）：uploadId 就是后端颁发的临时凭据，
 * 让请求体带 path 等于允许越权写入他人 note/{id}/images，因此断言必须盯住传给 Feign 的参数。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteServiceImplCreateImageUploadTaskTest {

    private static final long NOTE_ID = 42L;

    @Mock
    private NoteMapper noteMapper;

    @Mock
    private RemoteFileService remoteFileService;

    private NoteServiceImpl noteService;

    @BeforeEach
    void setUp() {
        noteService = new NoteServiceImpl();
        ReflectionTestUtils.setField(noteService, "baseMapper", noteMapper);
        ReflectionTestUtils.setField(noteService, "remoteFileService", remoteFileService);
    }

    private NoteImageUploadTaskCreateParam param() {
        OssSliceUploadTaskCreatePublicDTO dto = new OssSliceUploadTaskCreatePublicDTO();
        dto.setFileName("shot.png");
        dto.setHash("abc123");
        dto.setFileSize(1.5);
        dto.setContentType("image/png");
        return new NoteImageUploadTaskCreateParam(NOTE_ID, dto);
    }

    private Note existingNote() {
        Note note = Note.builder().id(NOTE_ID).deleted(0).build();
        return note;
    }

    private ResData<OssSliceUploadTaskVO> success() {
        return ResData.success(OssSliceUploadTaskVO.builder()
                .uploadId("u1")
                .chunkSize(5)
                .totalChunk(1)
                .build());
    }

    @Test
    @DisplayName("正常创建：path 用 note/{id}/images、source 用 NOTE_IMAGE，两者都不从请求体取")
    void sendsServerSidePathAndSource() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(existingNote());
        when(remoteFileService.createOssSliceUploadTask(any())).thenReturn(success());

        noteService.createNoteImageUploadTask(param());

        ArgumentCaptor<OssSliceUploadTaskCreateDTO> captor =
                ArgumentCaptor.forClass(OssSliceUploadTaskCreateDTO.class);
        verify(remoteFileService).createOssSliceUploadTask(captor.capture());
        OssSliceUploadTaskCreateDTO sent = captor.getValue();

        assertEquals("note/42/images", sent.getPath());
        assertEquals(FileSources.NOTE_IMAGE.getValue(), sent.getSource());
        // 公开字段照常透传
        assertEquals("shot.png", sent.getFileName());
        assertEquals("abc123", sent.getHash());
        assertEquals(1.5, sent.getFileSize());
        assertEquals("image/png", sent.getContentType());
    }

    @Test
    @DisplayName("笔记不存在时抛资源未找到，且不调用 file 服务")
    void rejectsMissingNote() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> noteService.createNoteImageUploadTask(param()));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
        verify(remoteFileService, never()).createOssSliceUploadTask(any());
    }

    @Test
    @DisplayName("笔记已逻辑删除时拒绝创建，且不调用 file 服务")
    void rejectsDeletedNote() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(Note.builder().id(NOTE_ID).deleted(1).build());

        BusinessException exception = assertThrows(BusinessException.class,
                () -> noteService.createNoteImageUploadTask(param()));

        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
        verify(remoteFileService, never()).createOssSliceUploadTask(any());
    }

    @Test
    @DisplayName("Feign 返回错误码时包成 BusinessException，不把半成品返回给前端")
    void wrapsFeignFailure() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(existingNote());
        when(remoteFileService.createOssSliceUploadTask(any()))
                .thenReturn(ResData.error(ResCode.INNER_FILE_SERVICE_ERROR));

        assertThrows(BusinessException.class, () -> noteService.createNoteImageUploadTask(param()));
    }

    @Test
    @DisplayName("Feign 返回 null 时抛 BusinessException（不返回 null 给前端）")
    void wrapsNullFeignResponse() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(existingNote());
        when(remoteFileService.createOssSliceUploadTask(any())).thenReturn(null);

        assertThrows(BusinessException.class, () -> noteService.createNoteImageUploadTask(param()));
    }

    @Test
    @DisplayName("Feign 返回成功码但 data 为空时同样拒绝")
    void wrapsEmptyData() {
        when(noteMapper.selectById(NOTE_ID)).thenReturn(existingNote());
        when(remoteFileService.createOssSliceUploadTask(any()))
                .thenReturn(ResData.success(null));

        assertThrows(BusinessException.class, () -> noteService.createNoteImageUploadTask(param()));
    }
}
