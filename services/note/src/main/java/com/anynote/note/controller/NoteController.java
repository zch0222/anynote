package com.anynote.note.controller;

import com.anynote.common.datascope.annotation.DataScope;
import com.anynote.common.elasticsearch.model.EsNoteIndex;
import com.anynote.common.elasticsearch.model.bo.SearchPageBean;
import com.anynote.core.constant.ErrorMessageConstants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.model.bo.HuaweiOBSTemporarySignature;
import com.anynote.file.api.model.dto.CompleteUploadDTO;
import com.anynote.file.api.model.dto.OssSliceUploadTaskCreatePublicDTO;
import com.anynote.file.api.model.vo.OssSliceUploadTaskVO;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.datascope.annotation.RequiresNotePermissions;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.mapper.NoteHistoryMapper;
import com.anynote.note.mapper.NoteOperationLogMapper;
import com.anynote.note.model.bo.*;
import com.anynote.note.model.dto.*;
import com.anynote.note.model.vo.NoteHistoryListItemVO;
import com.anynote.note.model.vo.NoteHistoryVO;
import com.anynote.note.model.vo.NoteListVO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.anynote.note.service.NoteHistoryService;
import com.anynote.note.service.NoteService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 *
 * @author 称霸幼儿园
 */
@Tag(name = "笔记", description = "笔记CRUD接口")
@RestController
@RequestMapping("/notes")
@Validated
public class NoteController {

    @Autowired
    private NoteService noteService;


    @Resource
    private NoteHistoryService noteHistoryService;

    @Operation(summary = "分页查询当前用户的笔记列表", description = "可按 knowledgeBaseId 过滤")
    @GetMapping()
    public ResData<PageBean<NoteListVO>> getNoteList(@NotNull(message = "页码不能为空") @Min(value = 1, message = "页码错误")
                                                   Integer page,
                                                     @NotNull(message = "页面大小不能为空")
                                               @Max(value = 100, message = "页面大小错误")
                                               @Min(value = 1, message = "页面大小错误")
                                               Integer pageSize,
                                                     Long knowledgeBaseId) {

        return ResUtil.success(noteService.getNoteList(NoteQueryParam.builder()
                        .page(page)
                        .pageSize(pageSize)
                        .knowledgeBaseId(knowledgeBaseId)
                .build()));
    }



    /**
     * 获取最近更新的笔记 (未完成)
     * @param page
     * @param pageSize
     * @return
     */
    @GetMapping("list")
    public ResData<PageBean<Note>> getNoteInfoList(@NotNull(message = ErrorMessageConstants.PAGE_NULL) Integer page,
                                         @NotNull(message = ErrorMessageConstants.PAGE_SIZE_NULL) Integer pageSize) {
        throw new BusinessException("暂未实现", ResCode.BUSINESS_ERROR);
    }

    @DataScope
    @PostMapping("bases/{baseId}")
    public ResData<PageBean<Note>> getNoteInfosByKnowledgeBaseId(@NotNull(message = "知识库id不能为空")
                                                                 @PathVariable Long baseId,
                                                                 @RequestBody NoteQueryParam queryParam) {
        if (StringUtils.isNull(queryParam.getPage())) {
            throw new UserParamException("页码不能为空", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (StringUtils.isNull(queryParam.getPageSize())) {
            throw new UserParamException("页面大小不能为空", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        queryParam.setKnowledgeBaseId(baseId);
        return ResUtil.success(noteService.getNotesByKnowledgeBaseId(queryParam));
    }

    @Operation(summary = "按 ID 获取笔记详情")
    @GetMapping("{noteId}")
    public ResData<Note> getNoteById(@NotNull(message = "笔记id不能为空")
                                     @PathVariable Long noteId) {
        NoteQueryParam queryParam = NoteQueryParam.builder()
                .id(noteId)
                .build();
        return ResUtil.success(noteService.getNoteById(queryParam));
    }

    @Operation(summary = "删除笔记", description = "逻辑删除笔记及其正文，需要笔记的管理权限")
    @DeleteMapping("{noteId}")
    public ResData<String> deleteNote(@NotNull(message = "笔记id不能为空") @PathVariable Long noteId) {
        NoteDeleteParam noteDeleteParam = new NoteDeleteParam();
        noteDeleteParam.setId(noteId);
        return ResUtil.success(noteService.deleteNote(noteDeleteParam));
    }

    /**
     * 新建笔记
     * @param noteCreateDTO
     * @return
     */
    @Operation(summary = "新建笔记", description = "在指定知识库下创建空白笔记，返回新笔记id；需要该知识库的编辑权限")
    @PostMapping()
    public ResData<Long> createNote(@Validated @RequestBody NoteCreateDTO noteCreateDTO) {
        NoteCreateParam createParam = new NoteCreateParam(noteCreateDTO);
        return ResData.success(noteService.createNote(createParam));
    }


    /**
     * 更新笔记内容
     * @param noteId
     * @return
     */
    @Operation(summary = "部分更新笔记",
            description = "支持标题、正文等字段；前端自动保存调用。"
                    + "请求体携带 version 时做乐观并发检测，版本过期返回业务码 A0409；"
                    + "成功时返回服务端权威的标题 / 正文 / 更新时间与新版本号")
    @PatchMapping("{noteId}")
    public ResData<NoteSaveResultVO> editNote(@NotNull(message = "笔记id不能为空") @PathVariable Long noteId,
                                              @RequestBody NoteEditDTO noteEditDTO) {
        noteEditDTO.setNoteId(noteId);
        return ResUtil.success(noteService.editNote(new NoteUpdateParam(noteEditDTO)));
    }

    @Operation(summary = "创建笔记图片上传任务",
            description = "浏览器分片直传第 1 步。path 与 source 由服务端按笔记归属决定，"
                    + "请求体只允许 fileName / hash / fileSize(MB) / contentType。"
                    + "返回的 uploadId 即后续换签名、标记、合并的凭据；需要该笔记的编辑权限")
    @PostMapping("{noteId}/images/uploadTasks")
    public ResData<OssSliceUploadTaskVO> createNoteImageUploadTask(
            @NotNull(message = "笔记id不能为空") @PathVariable Long noteId,
            @Validated @RequestBody OssSliceUploadTaskCreatePublicDTO createDTO) {
        return ResUtil.success(noteService.createNoteImageUploadTask(
                new NoteImageUploadTaskCreateParam(noteId, createDTO)));
    }

    @PostMapping("images")
    public ResData<MarkdownImage> uploadNoteImage(@RequestParam("image") @NotNull(message = "图片文件不能为空") MultipartFile image,
                                                  @RequestParam("noteId") @NotNull(message = "笔记id不能为空") Long noteId,
                                                  @RequestParam(value = "uploadId", required = false) String uploadId) {
        NoteImageUploadParam imageUploadParam = new NoteImageUploadParam();
        imageUploadParam.setId(noteId);
        imageUploadParam.setImage(image);
        imageUploadParam.setUploadId(uploadId);
        return ResUtil.success(noteService.uploadNoteImage(imageUploadParam));
    }

    @PostMapping("img")
    public ResData<HuaweiOBSTemporarySignature> imageUploadTempLink(@Validated @RequestBody NoteImageUploadTempLinkDTO noteImageUploadTempLinkDTO) {
        return ResUtil.success(noteService.getImageUploadTempSignature(NoteImageUploadSignatureCreateParam
                .NoteImageUploadSignatureCreateParamBuilder()
                        .fileName(noteImageUploadTempLinkDTO.getFileName())
                        .contentType(noteImageUploadTempLinkDTO.getContentType())
                        .noteId(noteImageUploadTempLinkDTO.getNoteId()).build()));
    }

    @PutMapping("img")
    public ResData<String> completeNoteImageUpload(@Validated @RequestBody CompleteNoteImageUploadDTO completeUploadDTO) {
        return ResUtil.success(noteService.completeNoteImageUpload(NoteImageCompleteParam.NoteImageCompleteParamBuilder()
                        .noteId(completeUploadDTO.getNoteId())
                        .hash(completeUploadDTO.getHash())
                        .uploadId(completeUploadDTO.getUploadId()).build()));
    }


    @GetMapping("search")
    public ResData<SearchPageBean<EsNoteIndex>> searchNote(@Valid NoteSearchDTO noteSearchDTO) {
        return ResUtil.success(noteService.searchNote(noteSearchDTO));
    }

    /**
     * 笔记历史列表
     * @param noteId 笔记id
     * @param page 笔记页码
     * @param pageSize
     * @return
     */
    @Operation(summary = "笔记历史版本列表", description = "分页返回笔记的编辑历史，按操作时间倒序")
    @GetMapping("historyList")
    public ResData<PageBean<NoteHistoryListItemVO>> getHistoryList(
            @Parameter(description = "笔记id", required = true)
            @NotNull(message = "笔记id不能为空") Long noteId,
            @Parameter(description = "页码，从 1 起", required = true)
            @NotNull(message = "页码不能为空") @Min(value = 1, message = "页码错误") Integer page,
            @Parameter(description = "页面大小，上限 50", required = true)
            @NotNull(message = "页面大小不能为空") @Min(value = 1, message = "页面大小错误")
            @Max(value = 50, message = "页面大小错误") Integer pageSize) {
        return ResUtil.success(noteHistoryService.getNoteHistoryListItemVOList(NoteHistoryListItemQueryParam.NoteHistoryListItemQueryParamBuilder()
                .noteId(noteId)
                .page(page)
                .pageSize(pageSize)
                .build()));
    }

    /**
     * 笔记历史版本内容
     * @param operationId 操作日志id
     * @return 该操作对应的历史版本
     */
    @Operation(summary = "笔记历史版本内容", description = "按操作日志id返回历史版本；操作日志不存在时返回 A0404 业务错误，而不是 500")
    @GetMapping("history")
    public ResData<NoteHistoryVO> getNoteHistory(
            @Parameter(description = "操作日志id", required = true)
            @NotNull(message = "操作id不能为空") Long operationId) {
        return ResUtil.success(noteHistoryService.getNoteHistoryByOperationId(operationId));
    }







}
