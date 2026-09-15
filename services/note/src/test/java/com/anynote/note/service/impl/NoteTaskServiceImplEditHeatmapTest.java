package com.anynote.note.service.impl;

import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.model.bo.NoteTaskChartsQueryParam;
import com.anynote.note.model.bo.NoteTaskEditHeatmapQueryParam;
import com.anynote.note.model.po.NoteTaskEditHeatmapPO;
import com.anynote.note.model.po.NoteTaskSubmissionTimePO;
import com.anynote.note.model.po.NoteTaskSubmitMemberPO;
import com.anynote.note.model.vo.NoteTaskEditHeatmapMemberVO;
import com.anynote.note.model.vo.NoteTaskEditHeatmapVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * {@link NoteTaskServiceImpl#getNoteTaskEditHeatmap} 与 {@link NoteTaskServiceImpl#getNoteTaskChartsData}
 * 的纯单测。
 *
 * <p>热力图是任务详情页 D-17「成员编辑活跃度」的数据源（方案 §4 B-1）。旧 charts 端点按小时逐段查询、
 * 没有提交时直接空指针，这里同时钉住新端点的窗口语义与旧端点的空数据防护。</p>
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NoteTaskServiceImplEditHeatmapTest {

    private static final long TASK_ID = 292L;
    private static final long USER_A = 101L;
    private static final long USER_B = 102L;

    private static final LocalDate TODAY = LocalDate.now();

    @Mock
    private NoteTaskMapper noteTaskMapper;

    private NoteTaskServiceImpl noteTaskService;

    @BeforeEach
    void setUp() {
        noteTaskService = new NoteTaskServiceImpl();
        ReflectionTestUtils.setField(noteTaskService, "baseMapper", noteTaskMapper);
    }

    private static Date day(LocalDate date) {
        return Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant());
    }

    private static Date at(LocalDate date, int hour) {
        return Date.from(date.atTime(hour, 0).atZone(ZoneId.systemDefault()).toInstant());
    }

    private NoteTask task(LocalDate start, LocalDate end) {
        return NoteTask.builder()
                .id(TASK_ID)
                .taskName("期末笔记任务")
                .startTime(day(start))
                .endTime(day(end))
                .knowledgeBaseId(70L)
                .status(0)
                .deleted(0)
                .build();
    }

    private NoteTaskSubmitMemberPO member(long userId, String username, String nickname, long noteId) {
        NoteTaskSubmitMemberPO po = new NoteTaskSubmitMemberPO();
        po.setUserId(userId);
        po.setUsername(username);
        po.setNickname(nickname);
        po.setNoteId(noteId);
        return po;
    }

    private NoteTaskEditHeatmapPO editRow(long userId, String username, String nickname,
                                          long noteId, LocalDate date, int count) {
        NoteTaskEditHeatmapPO po = new NoteTaskEditHeatmapPO();
        po.setUserId(userId);
        po.setUsername(username);
        po.setNickname(nickname);
        po.setNoteId(noteId);
        po.setEditDate(day(date));
        po.setEditCount(count);
        return po;
    }

    private NoteTaskEditHeatmapVO heatmap() {
        NoteTaskEditHeatmapQueryParam queryParam = new NoteTaskEditHeatmapQueryParam();
        queryParam.setNoteTaskId(TASK_ID);
        return noteTaskService.getNoteTaskEditHeatmap(queryParam);
    }

    @Test
    @DisplayName("无提交时 members 为空，days 仍覆盖整个窗口")
    void noSubmission() {
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(task(TODAY.minusDays(1), TODAY.plusDays(1)));
        when(noteTaskMapper.selectNoteTaskEditHeatmap(any())).thenReturn(Collections.emptyList());
        when(noteTaskMapper.selectNoteTaskSubmitMembers(anyLong())).thenReturn(Collections.emptyList());

        NoteTaskEditHeatmapVO vo = heatmap();

        assertTrue(vo.getMembers().isEmpty(), "没有提交时不应出现成员行");
        assertEquals(3, vo.getDays().size());
        assertEquals(TODAY.minusDays(1).toString(), vo.getDays().get(0));
        assertEquals(TODAY.plusDays(1).toString(), vo.getDays().get(2));
        assertEquals(TODAY.toString(), vo.getToday(), "today 是服务端当天");
    }

    @Test
    @DisplayName("两名成员跨三天编辑：counts 按日期落位，按 total 降序")
    void twoMembersAcrossThreeDays() {
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(task(TODAY.minusDays(1), TODAY.plusDays(1)));
        when(noteTaskMapper.selectNoteTaskSubmitMembers(anyLong())).thenReturn(Arrays.asList(
                member(USER_A, "alice", "爱丽丝", 501L),
                member(USER_B, "bob", "鲍勃", 502L)));
        when(noteTaskMapper.selectNoteTaskEditHeatmap(any())).thenReturn(Arrays.asList(
                editRow(USER_A, "alice", "爱丽丝", 501L, TODAY.minusDays(1), 1),
                editRow(USER_B, "bob", "鲍勃", 502L, TODAY.minusDays(1), 2),
                editRow(USER_B, "bob", "鲍勃", 502L, TODAY, 2),
                editRow(USER_B, "bob", "鲍勃", 502L, TODAY.plusDays(1), 1)));

        NoteTaskEditHeatmapVO vo = heatmap();

        assertEquals(2, vo.getMembers().size());
        NoteTaskEditHeatmapMemberVO first = vo.getMembers().get(0);
        assertEquals(USER_B, first.getUserId(), "total 大的排前面");
        assertEquals(5, first.getTotal());
        assertEquals(Arrays.asList(2, 2, 1), first.getCounts(), "counts 与 days 逐日对齐");
        NoteTaskEditHeatmapMemberVO second = vo.getMembers().get(1);
        assertEquals(USER_A, second.getUserId());
        assertEquals(1, second.getTotal());
        assertEquals(Arrays.asList(1, 0, 0), second.getCounts());
        assertEquals(502L, first.getNoteId());
        assertEquals("鲍勃", first.getNickname());
    }

    @Test
    @DisplayName("已提交但窗口内没有编辑的成员也要出现，counts 全 0")
    void submittedWithoutEdit() {
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(task(TODAY.minusDays(2), TODAY));
        when(noteTaskMapper.selectNoteTaskSubmitMembers(anyLong())).thenReturn(Collections.singletonList(
                member(USER_A, "alice", "爱丽丝", 501L)));
        when(noteTaskMapper.selectNoteTaskEditHeatmap(any())).thenReturn(Collections.emptyList());

        NoteTaskEditHeatmapVO vo = heatmap();

        assertEquals(1, vo.getMembers().size());
        NoteTaskEditHeatmapMemberVO row = vo.getMembers().get(0);
        assertEquals(USER_A, row.getUserId());
        assertEquals(0, row.getTotal());
        assertEquals(Arrays.asList(0, 0, 0), row.getCounts());
        assertNotNull(row.getCounts());
    }

    @Test
    @DisplayName("90 天窗口且今天是第 80 天：days 长 62，末尾是今天")
    void longWindowIsCappedAt62Days() {
        LocalDate start = TODAY.minusDays(79);
        LocalDate end = start.plusDays(89);
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(task(start, end));
        when(noteTaskMapper.selectNoteTaskEditHeatmap(any())).thenReturn(Collections.emptyList());
        when(noteTaskMapper.selectNoteTaskSubmitMembers(anyLong())).thenReturn(Collections.emptyList());

        NoteTaskEditHeatmapVO vo = heatmap();

        assertEquals(62, vo.getDays().size());
        assertEquals(TODAY.toString(), vo.getDays().get(vo.getDays().size() - 1), "末尾必须是今天");
        assertEquals(TODAY.minusDays(61).toString(), vo.getDays().get(0));
        assertEquals(start.toString(), vo.getStartDate(), "startDate/endDate 仍是任务原始窗口，不受截断影响");
        assertEquals(end.toString(), vo.getEndDate());
    }

    @Test
    @DisplayName("任务还没开始：today < startDate，days 仍完整")
    void notStartedTask() {
        LocalDate start = TODAY.plusDays(3);
        LocalDate end = TODAY.plusDays(5);
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(task(start, end));
        when(noteTaskMapper.selectNoteTaskEditHeatmap(any())).thenReturn(Collections.emptyList());
        when(noteTaskMapper.selectNoteTaskSubmitMembers(anyLong())).thenReturn(Collections.emptyList());

        NoteTaskEditHeatmapVO vo = heatmap();

        assertEquals(3, vo.getDays().size());
        assertEquals(start.toString(), vo.getDays().get(0));
        assertEquals(end.toString(), vo.getDays().get(2));
        assertTrue(vo.getToday().compareTo(vo.getStartDate()) < 0, "today 早于任务开始日");
    }

    @Test
    @DisplayName("任务不存在时抛 UserParamException（A0404）")
    void missingTask() {
        when(noteTaskMapper.selectById(TASK_ID)).thenReturn(null);

        UserParamException exception = assertThrows(UserParamException.class, this::heatmap);

        assertEquals("任务不存在", exception.getMessage());
        assertEquals(ResCode.INVALID_USER_INPUT_NOT_FOUND, exception.getErrorCode());
    }

    @Test
    @DisplayName("charts：没有任何提交时返回空列表而不是空指针")
    void chartsWithoutSubmission() {
        when(noteTaskMapper.selectNoteTaskSubmissionTime(TASK_ID))
                .thenReturn(new NoteTaskSubmissionTimePO());

        NoteTaskChartsQueryParam queryParam = new NoteTaskChartsQueryParam();
        queryParam.setNoteTaskId(TASK_ID);

        assertEquals(new ArrayList<>(), noteTaskService.getNoteTaskChartsData(queryParam));
    }

    @Test
    @DisplayName("charts：查询结果整体为 null 时同样返回空列表")
    void chartsWithNullTimeRow() {
        when(noteTaskMapper.selectNoteTaskSubmissionTime(TASK_ID)).thenReturn(null);

        NoteTaskChartsQueryParam queryParam = new NoteTaskChartsQueryParam();
        queryParam.setNoteTaskId(TASK_ID);

        List<?> rows = noteTaskService.getNoteTaskChartsData(queryParam);

        assertTrue(rows.isEmpty());
    }
}
