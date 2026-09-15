package com.anynote.note.service.impl;

import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.note.api.model.po.NoteOperationLog;
import com.anynote.note.mapper.NoteHistoryMapper;
import com.anynote.note.mapper.NoteOperationLogMapper;
import com.anynote.note.model.bo.NoteHistoryListItemQueryParam;
import com.anynote.note.model.vo.NoteHistoryListItemVO;
import com.anynote.note.model.vo.NoteHistoryVO;
import com.anynote.note.service.NoteOperationLogService;
import com.github.pagehelper.Page;
import com.github.pagehelper.PageHelper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/**
 * {@link NoteHistoryServiceImpl#getNoteHistoryByOperationId} 的纯单测。
 *
 * <p>这条链路原来把「查操作日志」留在 Controller 里，id 不存在时对 null 取 noteId 直接空指针、
 * 返回 500（方案 §4 B-2）。修好后统一抛 A0404 业务错误，本测试同时钉住正常返回的字段透传。</p>
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteHistoryServiceImplTest {

    private static final long OPERATION_ID = 90229L;
    private static final long NOTE_ID = 42L;

    @Mock
    private NoteHistoryMapper noteHistoryMapper;

    @Mock
    private NoteOperationLogMapper noteOperationLogMapper;

    @Mock
    private NoteOperationLogService noteOperationLogService;

    private NoteHistoryServiceImpl noteHistoryService;

    @BeforeEach
    void setUp() {
        noteHistoryService = new NoteHistoryServiceImpl();
        ReflectionTestUtils.setField(noteHistoryService, "baseMapper", noteHistoryMapper);
        ReflectionTestUtils.setField(noteHistoryService, "noteOperationLogService", noteOperationLogService);
        when(noteOperationLogService.getBaseMapper()).thenReturn(noteOperationLogMapper);
        // 单测里没有 Spring 代理，self 指回被测实例本身；getNoteHistory 的业务语义照常执行
        ReflectionTestUtils.setField(noteHistoryService, "self", noteHistoryService);
    }

    private NoteHistoryVO historyVO() {
        NoteHistoryVO vo = new NoteHistoryVO();
        vo.setNoteId(NOTE_ID);
        vo.setTitle("第三周笔记");
        vo.setContent("<p>正文内容</p>");
        vo.setHistoryTime(new Date(1757000000000L));
        return vo;
    }

    @Test
    @DisplayName("操作日志不存在时抛 UserParamException（A0404），不再空指针")
    void missingOperationLog() {
        when(noteOperationLogMapper.selectById(OPERATION_ID)).thenReturn(null);

        UserParamException exception = assertThrows(UserParamException.class,
                () -> noteHistoryService.getNoteHistoryByOperationId(OPERATION_ID));

        assertEquals("历史版本不存在", exception.getMessage());
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }

    @Test
    @DisplayName("正常返回 title / content / historyTime")
    void returnsHistoryDetail() {
        when(noteOperationLogMapper.selectById(OPERATION_ID))
                .thenReturn(NoteOperationLog.builder().id(OPERATION_ID).noteId(NOTE_ID).build());
        when(noteHistoryMapper.selectNoteHistory(OPERATION_ID)).thenReturn(historyVO());

        NoteHistoryVO result = noteHistoryService.getNoteHistoryByOperationId(OPERATION_ID);

        assertEquals("第三周笔记", result.getTitle());
        assertEquals("<p>正文内容</p>", result.getContent());
        assertEquals(new Date(1757000000000L), result.getHistoryTime());
        assertEquals(NOTE_ID, result.getNoteId());
    }

    @Test
    @DisplayName("historyList 分页参数透传到 PageHelper 的本地分页对象")
    void historyListPassesPagingThrough() {
        when(noteHistoryMapper.selectNoteHistoryListItemVOList(NOTE_ID))
                .thenReturn(Collections.<NoteHistoryListItemVO>emptyList());
        NoteHistoryListItemQueryParam queryParam = NoteHistoryListItemQueryParam
                .NoteHistoryListItemQueryParamBuilder()
                .noteId(NOTE_ID)
                .page(2)
                .pageSize(15)
                .build();

        try {
            PageBean<NoteHistoryListItemVO> pageBean =
                    noteHistoryService.getNoteHistoryListItemVOList(queryParam);

            assertEquals(NOTE_ID, queryParam.getNoteId(), "noteId 原样透传");
            assertEquals(2, pageBean.getCurrent(), "page 回填到返回体");
            Page<?> localPage = PageHelper.getLocalPage();
            assertNotNull(localPage, "PageHelper.startPage 已生效");
            assertEquals(2, localPage.getPageNum());
            assertEquals(15, localPage.getPageSize());
        } finally {
            // PageHelper 的分页参数挂在 ThreadLocal 上，不清理会污染同一线程里的后续用例
            PageHelper.clearPage();
        }
    }
}
