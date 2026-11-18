package com.anynote.note.controller;

import com.anynote.common.security.annotation.InnerAuth;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.utils.ResUtil;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.model.dto.KnowledgeAuthorizeDTO;
import com.anynote.note.model.dto.KnowledgeAuthorizeBatchDTO;
import com.anynote.note.model.dto.KnowledgeContentDTO;
import com.anynote.note.model.dto.KnowledgeDocumentBatchDTO;
import com.anynote.note.model.dto.KnowledgeExportDTO;
import com.anynote.note.model.dto.KnowledgeIndexStatusDTO;
import com.anynote.note.model.dto.KnowledgeOutlineDTO;
import com.anynote.note.model.dto.KnowledgeQueryDTO;
import com.anynote.note.model.dto.KnowledgeScopeDTO;
import com.anynote.note.model.dto.KnowledgeStatsDTO;
import com.anynote.note.model.vo.KnowledgeAuthorizationVO;
import com.anynote.note.model.vo.KnowledgeAuthorizeBatchVO;
import com.anynote.note.model.vo.KnowledgeChangePageVO;
import com.anynote.note.model.vo.KnowledgeContentVO;
import com.anynote.note.model.vo.KnowledgeDocumentBatchVO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeOutlineVO;
import com.anynote.note.model.vo.KnowledgeQueryVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeStatsVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.KnowledgeContentService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.note.service.KnowledgeOutlineService;
import com.anynote.note.service.KnowledgeQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 知识访问内部端点。
 *
 * @author 称霸幼儿园
 */
@Tag(name = "知识访问（内部）", description = "检索与索引服务使用的知识访问端点")
@RestController
@RequestMapping("/internal/v1/knowledge")
public class KnowledgeController {

    private final TokenUtil tokenUtil;
    private final KnowledgeAccessService knowledgeAccessService;
    private final KnowledgeContentService knowledgeContentService;
    private final KnowledgeOutlineService knowledgeOutlineService;
    private final KnowledgeQueryService knowledgeQueryService;
    private final KnowledgeEntityService knowledgeEntityService;
    private final KnowledgeChangeService knowledgeChangeService;

    /**
     * 构造知识访问端点。
     */
    public KnowledgeController(TokenUtil tokenUtil, KnowledgeAccessService knowledgeAccessService,
                               KnowledgeContentService knowledgeContentService,
                               KnowledgeOutlineService knowledgeOutlineService,
                               KnowledgeQueryService knowledgeQueryService,
                               KnowledgeEntityService knowledgeEntityService,
                               KnowledgeChangeService knowledgeChangeService) {
        this.tokenUtil = tokenUtil;
        this.knowledgeAccessService = knowledgeAccessService;
        this.knowledgeContentService = knowledgeContentService;
        this.knowledgeOutlineService = knowledgeOutlineService;
        this.knowledgeQueryService = knowledgeQueryService;
        this.knowledgeEntityService = knowledgeEntityService;
        this.knowledgeChangeService = knowledgeChangeService;
    }

    /**
     * 获取当前用户的检索范围。
     *
     * @param request 显式知识库与实体范围，可为空
     * @return 知识库范围
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "获取检索范围", description = "返回当前用户的默认或显式知识库范围")
    @PostMapping("/scope")
    public ResData<KnowledgeScopeVO> scope(@RequestBody(required = false) KnowledgeScopeDTO request) {
        return ResUtil.success(knowledgeAccessService.scope(tokenUtil.getLoginUser(), request));
    }

    /**
     * 统计检索范围内各知识库的直属可读内容。
     *
     * @param request 显式知识库范围，可为空
     * @return 各知识库的计数与最近更新时间
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "统计知识库内容", description = "返回检索范围内各知识库的笔记、资料、慕课与任务的可读数量")
    @PostMapping("/stats")
    public ResData<KnowledgeStatsVO> stats(@RequestBody(required = false) KnowledgeStatsDTO request) {
        return ResUtil.success(knowledgeQueryService.stats(tokenUtil.getLoginUser(), request));
    }

    /**
     * 批量确认当前用户对实体的可读性。
     *
     * @param request 待判定实体列表
     * @return 与输入同序的可读性结果
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "批量确认知识可读性", description = "最多判定100个实体并返回当前版本")
    @PostMapping("/authorize")
    public ResData<KnowledgeAuthorizationVO> authorize(@Valid @RequestBody KnowledgeAuthorizeDTO request) {
        return ResUtil.success(knowledgeAccessService.authorize(tokenUtil.getLoginUser(), request));
    }

    /**
     * 按复合实体键批量确认当前用户的可读集合。
     *
     * @param request 复合实体键列表（每批最多 100 条）
     * @return 可读实体键列表
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "按复合键批量确认可读性", description = "供服务间复核使用，返回可读键集合")
    @PostMapping("/authorize-batch")
    public ResData<KnowledgeAuthorizeBatchVO> authorizeBatch(
            @Valid @RequestBody KnowledgeAuthorizeBatchDTO request) {
        return ResUtil.success(KnowledgeAuthorizeBatchVO.builder()
                .readable(knowledgeAccessService.authorizeCombined(
                        tokenUtil.getLoginUser(), request.getRefs()))
                .build());
    }

    /**
     * 读取当前用户可读的实体正文片段。
     *
     * @param request 实体与读取范围
     * @return 正文片段与续读偏移
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "读取知识正文", description = "按标题、行、字幕时间或字符偏移读取权威正文")
    @PostMapping("/content")
    public ResData<KnowledgeContentVO> content(@RequestBody KnowledgeContentDTO request) {
        return ResUtil.success(knowledgeContentService.read(tokenUtil.getLoginUser(), request));
    }

    /**
     * 读取当前用户可读的目录或大纲。
     *
     * @param request 目录根实体与分页参数
     * @return 目录节点分页结果
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "读取知识目录与大纲", description = "返回知识库目录、慕课条目或Markdown标题")
    @PostMapping("/outline")
    public ResData<KnowledgeOutlineVO> outline(@RequestBody KnowledgeOutlineDTO request) {
        return ResUtil.success(knowledgeOutlineService.outline(tokenUtil.getLoginUser(), request));
    }

    /**
     * 执行结构化知识查询。
     *
     * @param request 实体、过滤器、排序与条数
     * @return 权限过滤后的查询结果
     */
    @InnerAuth(isUser = true)
    @Operation(summary = "执行结构化知识查询", description = "执行全实体白名单查询或MY_TASKS命名查询")
    @PostMapping("/query")
    public ResData<KnowledgeQueryVO> query(@RequestBody KnowledgeQueryDTO request) {
        return ResUtil.success(knowledgeQueryService.query(tokenUtil.getLoginUser(), request));
    }

    /**
     * 按游标读取知识变更。
     *
     * @param afterId 上一页游标，缺省为 0
     * @param limit 页大小，缺省为 200
     * @return 变更分页结果
     */
    @InnerAuth
    @Operation(summary = "读取知识变更游标", description = "按自增游标返回最多500条变更")
    @GetMapping("/changes")
    public ResData<KnowledgeChangePageVO> changes(
            @Parameter(description = "上一页游标") @RequestParam(required = false) Long afterId,
            @Parameter(description = "页大小") @RequestParam(required = false) Integer limit) {
        return ResUtil.success(knowledgeChangeService.changes(afterId == null ? 0L : afterId,
                limit == null ? 200 : limit));
    }

    /**
     * 按实体类型和 id 游标导出源文档。
     *
     * @param request 实体类型、知识库、游标与条数
     * @return 源文档分页结果
     */
    @InnerAuth
    @Operation(summary = "导出知识源文档", description = "按实体类型和id游标导出权威源文档")
    @PostMapping("/export")
    public ResData<KnowledgeExportVO> export(@RequestBody KnowledgeExportDTO request) {
        if (request == null) {
            throw invalidEntity();
        }
        int limit = request.getLimit() == null ? 100 : request.getLimit();
        if (limit < 1 || limit > 200) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        long afterId = request.getAfterId() == null ? 0L : request.getAfterId();
        if (afterId < 0) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_CONTENT_RANGE,
                    ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (request.getKbId() != null && request.getKbId() < 0) {
            throw invalidEntity();
        }
        return ResUtil.success(knowledgeEntityService.export(request.getEntityType(), request.getKbId(), afterId, limit));
    }

    /**
     * 回写资料索引状态。
     *
     * @param id 资料 id
     * @param request 索引状态
     * @return 操作结果
     */
    @InnerAuth
    @Operation(summary = "回写资料索引状态", description = "更新n_doc.index_status且不产生知识变更")
    @PutMapping("/docs/{id}/index-status")
    public ResData<String> updateDocIndexStatus(
            @Parameter(description = "资料id") @PathVariable Long id,
            @RequestBody KnowledgeIndexStatusDTO request) {
        knowledgeChangeService.updateDocIndexStatus(id, request == null ? null : request.getStatus());
        return ResUtil.success("SUCCESS");
    }

    /**
     * 按引用批量读取知识源文档。
     *
     * @param request 引用列表与是否读取正文开关
     * @return 命中的源文档与缺失引用列表
     */
    @InnerAuth
    @Operation(summary = "批量读取知识源文档", description = "按实体引用批量返回权威源文档，最多100条")
    @PostMapping("/documents/batch")
    public ResData<KnowledgeDocumentBatchVO> getBatch(@RequestBody KnowledgeDocumentBatchDTO request) {
        if (request == null) {
            throw invalidEntity();
        }
        boolean includeBody = request.getIncludeBody() == null || request.getIncludeBody();
        return ResUtil.success(knowledgeEntityService.getBatch(request.getRefs(), includeBody));
    }

    /**
     * 登记内部知识变更记录。
     *
     * @param request 变更参数
     * @return 变更游标 id
     */
    @InnerAuth
    @Operation(summary = "登记知识变更记录", description = "向统一知识变更游标追加一条变更记录")
    @PostMapping("/changes")
    public ResData<Long> recordChange(@RequestBody KnowledgeChangeRecordDTO request) {
        return ResUtil.success(knowledgeChangeService.record(request));
    }

    /**
     * 登记视频总结变更。
     *
     * @param moocItemId 慕课条目 id
     * @return 变更游标 id
     */
    @InnerAuth
    @Operation(summary = "登记视频总结变更", description = "为最新视频总结插入UPDATE变更记录")
    @PostMapping("/mooc-items/{moocItemId}/summary-changes")
    public ResData<Long> recordSummaryChange(
            @Parameter(description = "慕课条目id") @PathVariable Long moocItemId) {
        return ResUtil.success(knowledgeChangeService.recordSummaryChange(moocItemId));
    }

    private BusinessException invalidEntity() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
