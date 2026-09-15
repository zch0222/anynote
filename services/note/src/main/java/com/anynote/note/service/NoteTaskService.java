package com.anynote.note.service;

import com.anynote.core.web.model.bo.PageBean;
import com.anynote.note.api.model.bo.NoteOperationCount;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.enums.NoteTaskPermissions;
import com.anynote.note.model.bo.*;
import com.anynote.note.api.model.vo.AdminNoteTaskVO;
import com.anynote.note.model.dto.MemberNoteTaskDTO;
import com.anynote.note.api.model.vo.NoteTaskChartsVO;
import com.anynote.note.model.vo.NoteTaskEditHeatmapVO;
import com.anynote.note.model.vo.NoteTaskHistoryVO;
import com.anynote.note.model.vo.NoteTaskUserAnalyzeVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

/**
 * @author 称霸幼儿园
 */
public interface NoteTaskService extends IService<NoteTask> {

    public Long createNoteTask(NoteTaskCreateParam taskCreateParam);

    public String submitNoteTask(NoteTaskSubmitParam submitParam);

    public AdminNoteTaskVO getAdminNoteTaskById(NoteTaskQueryParam queryParam);

    public Long getNoteTaskKnowledgeBaseId(Long noteTaskId);

    /**
     * 获取用户的任务权限
     * @param userId 用户ID
     * @param taskId 笔记ID
     * @return 权限
     */
    public NoteTaskPermissions getNoteTaskPermissions(Long userId, Long taskId);

    public PageBean<AdminNoteTaskVO> getAdminNoteTasks(NoteTaskQueryParam queryParam);

    public PageBean<MemberNoteTaskDTO> getMemberNoteTasks(NoteTaskQueryParam queryParam);

    public Long getNoteTaskNeedSubmitCount(NoteTaskQueryParam queryParam);

    public String updateNoteTask(NoteTaskUpdateParam updateParam);


    /**
     * 查询笔记编辑次数
     * @param queryParam
     * @return
     */
    public List<NoteOperationCount> getNoteOperationCounts(NoteTaskQueryParam queryParam);

    /**
     * 退回提交记录
     * @return
     */
    public String returnSubmission(SubmissionReturnParam submissionReturnParam);

    /**
     * 获取用户笔记任务操作历史
     * @param noteTaskId 笔记任务id
     * @return 用户笔记任务操作历史列表
     */
    public List<NoteTaskHistoryVO> getNoteTaskHistoryList(Long noteTaskId);

    public NoteTaskUserAnalyzeVO getUserNoteTaskAnalyze(NoteTaskAnalyzeQueryParam queryParam);

    public Integer insertUserNoteTask(UserNoteTask userNoteTask);

    /**
     * 根据知识库ID获取笔记任务列表
     * @param knowledgeBaseId
     * @return
     */
    public List<NoteTask> getNoteTasksByKnowledgeBaseId(Long knowledgeBaseId);

    public List<NoteTaskChartsVO> getNoteTaskChartsData(NoteTaskChartsQueryParam queryParam);


    public List<UserNoteTask> getTaskUsers(Long taskId);

    /**
     * 获取任务成员的编辑热力图（按天聚合、区间限定在任务时间窗口内）
     * @param queryParam 任务id入参（权限切面据此校验 MANAGE）
     * @return 任务时间窗口内的逐日编辑次数矩阵
     */
    public NoteTaskEditHeatmapVO getNoteTaskEditHeatmap(NoteTaskEditHeatmapQueryParam queryParam);

    /**
     * 成员侧获取单个任务（权限为任务所在知识库 READ，不在任务成员里时无权限）
     * @param queryParam 任务id与知识库id入参
     * @return 与任务列表行同结构的任务信息
     */
    public MemberNoteTaskDTO getMemberNoteTaskById(NoteTaskQueryParam queryParam);
}
