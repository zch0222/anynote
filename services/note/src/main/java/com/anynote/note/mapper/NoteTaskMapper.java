package com.anynote.note.mapper;

import com.anynote.note.api.model.bo.NoteOperationCount;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.model.bo.NoteTaskAnalyzeQueryParam;
import com.anynote.note.model.bo.NoteTaskChartsSelectParam;
import com.anynote.note.model.bo.NoteTaskEditHeatmapQueryParam;
import com.anynote.note.model.bo.NoteTaskQueryParam;
import com.anynote.note.model.dto.MemberNoteTaskDTO;
import com.anynote.note.model.po.NoteTaskAnalyzePO;
import com.anynote.note.api.model.po.NoteTaskChartsPO;
import com.anynote.note.model.po.NoteTaskEditHeatmapPO;
import com.anynote.note.model.po.NoteTaskSubmissionTimePO;
import com.anynote.note.model.po.NoteTaskSubmitMemberPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * @author 称霸幼儿园
 */
@Mapper
public interface NoteTaskMapper extends BaseMapper<NoteTask> {


    public List<MemberNoteTaskDTO> selectMemberNoteTaskList(NoteTaskQueryParam queryParam);

    public List<NoteOperationCount> selectNoteOperationCount(Long noteTaskId);

    public List<NoteTaskAnalyzePO> selectNoteTaskAnalyze(NoteTaskAnalyzeQueryParam queryParam);

    public List<NoteTaskChartsPO> selectNoteTaskCharts(NoteTaskChartsSelectParam param);

    public NoteTaskSubmissionTimePO selectNoteTaskSubmissionTime(@Param("noteTaskId") Long noteTaskId);

    /**
     * 按天聚合任务成员在其提交笔记上的编辑次数
     * @param param 任务id与统计区间
     * @return 逐日编辑次数行
     */
    public List<NoteTaskEditHeatmapPO> selectNoteTaskEditHeatmap(NoteTaskEditHeatmapQueryParam param);

    /**
     * 查询任务下状态正常的提交人清单（用于补齐窗口内没有编辑的成员）
     * @param noteTaskId 任务id
     * @return 提交人清单
     */
    public List<NoteTaskSubmitMemberPO> selectNoteTaskSubmitMembers(@Param("noteTaskId") Long noteTaskId);


}
