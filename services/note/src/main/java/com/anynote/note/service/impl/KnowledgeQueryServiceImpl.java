package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.NoteTaskSubmissionRecord;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeQueryName;
import com.anynote.note.enums.NoteTaskSubmissionRecordStatus;
import com.anynote.note.enums.UserNoteTaskStatus;
import com.anynote.note.mapper.NoteTaskSubmissionRecordMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeQueryDTO;
import com.anynote.note.model.dto.KnowledgeScopeDTO;
import com.anynote.note.model.dto.KnowledgeStatsDTO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeQueryVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.model.vo.KnowledgeStatsVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.note.service.KnowledgeQueryService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysRole;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 白名单结构化知识查询实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeQueryServiceImpl implements KnowledgeQueryService {

    private static final Set<String> COMMON_FILTERS = Set.of("titleContains", "createdBy", "createdAfter",
            "createdBefore", "updatedAfter", "updatedBefore");
    private static final Set<String> COMMON_SORTS = Set.of("updatedAt", "createdAt", "title");
    private static final Map<KnowledgeEntityType, Set<String>> ENTITY_FILTERS = Map.of(
            KnowledgeEntityType.KNOWLEDGE_BASE, Set.of("type", "status"),
            KnowledgeEntityType.NOTE, Set.of("status", "dataScope"),
            KnowledgeEntityType.DOC, Set.of("indexStatus", "dataScope"),
            KnowledgeEntityType.MOOC, Set.of("dataScope"),
            KnowledgeEntityType.MOOC_ITEM, Set.of("moocId", "parentId", "moocItemType"),
            KnowledgeEntityType.TASK, Set.of("status"));
    private static final Set<String> MY_TASK_FILTERS = Set.of("submissionStatus", "deadlineAfter", "deadlineBefore");
    private static final List<KnowledgeEntityType> STATS_TYPES = List.of(KnowledgeEntityType.NOTE,
            KnowledgeEntityType.DOC, KnowledgeEntityType.MOOC, KnowledgeEntityType.TASK);

    private final KnowledgeEntityService knowledgeEntityService;
    private final KnowledgeAccessService knowledgeAccessService;
    private final UserNoteTaskMapper userNoteTaskMapper;
    private final NoteTaskSubmissionRecordMapper submissionRecordMapper;

    /**
     * 构造结构化查询服务。
     */
    public KnowledgeQueryServiceImpl(KnowledgeEntityService knowledgeEntityService,
                                     KnowledgeAccessService knowledgeAccessService,
                                     UserNoteTaskMapper userNoteTaskMapper,
                                     NoteTaskSubmissionRecordMapper submissionRecordMapper) {
        this.knowledgeEntityService = knowledgeEntityService;
        this.knowledgeAccessService = knowledgeAccessService;
        this.userNoteTaskMapper = userNoteTaskMapper;
        this.submissionRecordMapper = submissionRecordMapper;
    }

    @Override
    public KnowledgeQueryVO query(LoginUser loginUser, KnowledgeQueryDTO request) {
        if (request == null) {
            throw invalidQuery();
        }
        KnowledgeEntityType type = KnowledgeEntityType.parse(request.getEntity());
        if (type == KnowledgeEntityType.NOTICE) {
            throw invalidQuery();
        }
        KnowledgeQueryName queryName = KnowledgeQueryName.parse(request.getQueryName());
        if (queryName != null && type != KnowledgeEntityType.TASK) {
            throw invalidQuery();
        }
        int limit = request.getLimit() == null ? 20 : request.getLimit();
        if (limit < 1) {
            throw invalidQuery();
        }
        if (limit > 100) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        Map<String, Object> filters = request.getFilters() == null ? Map.of() : request.getFilters();
        validateFilters(type, queryName, filters);
        Sort sort = parseSort(request.getSort(), type);
        KnowledgeScopeDTO scopeRequest = new KnowledgeScopeDTO();
        scopeRequest.setKnowledgeBaseIds(request.getKbIds());
        KnowledgeScopeVO scope = knowledgeAccessService.scope(loginUser, scopeRequest);
        LoginUser permissionUser = scope.isDefaultScope() && scope.isAdmin() ? asOrdinaryUser(loginUser) : loginUser;
        List<KnowledgeSourceDocumentVO> documents = loadDocuments(type, scope);
        List<QueryCandidate> candidates = new ArrayList<>();
        for (KnowledgeSourceDocumentVO document : documents) {
            if (!matches(document, filters, queryName, loginUser.getUserId())) {
                continue;
            }
            Map<String, Object> attributes = document.getAttributes() == null
                    ? new LinkedHashMap<>() : new LinkedHashMap<>(document.getAttributes());
            if (queryName == KnowledgeQueryName.MY_TASKS) {
                UserNoteTask userTask = userTask(loginUser.getUserId(), document.getEntityId());
                if (userTask == null || !matchesSubmission(userTask, filters)) {
                    continue;
                }
                enrichTask(attributes, userTask);
            }
            KnowledgeRef ref = KnowledgeRef.of(type,
                    document.getEntityId());
            if (!knowledgeAccessService.isReadable(permissionUser, ref)) {
                continue;
            }
            candidates.add(new QueryCandidate(document, attributes));
        }
        candidates.sort(comparator(sort));
        long count = candidates.size();
        List<KnowledgeQueryVO.Row> rows = candidates.stream().limit(limit).map(this::row).toList();
        return KnowledgeQueryVO.builder()
                .rows(rows)
                .count(Boolean.TRUE.equals(request.getWithCount()) ? count : null)
                .build();
    }

    @Override
    public KnowledgeStatsVO stats(LoginUser loginUser, KnowledgeStatsDTO request) {
        KnowledgeScopeDTO scopeRequest = new KnowledgeScopeDTO();
        scopeRequest.setKnowledgeBaseIds(request == null ? null : request.getKnowledgeBaseIds());
        KnowledgeScopeVO scope = knowledgeAccessService.scope(loginUser, scopeRequest);
        LoginUser permissionUser = scope.isDefaultScope() && scope.isAdmin() ? asOrdinaryUser(loginUser) : loginUser;
        List<KnowledgeStatsVO.KnowledgeBaseStats> knowledgeBases = new ArrayList<>();
        for (KnowledgeScopeVO.KnowledgeBase knowledgeBase : scope.getKnowledgeBases()) {
            Map<String, Long> counts = new LinkedHashMap<>();
            Date latestUpdateTime = null;
            for (KnowledgeEntityType type : STATS_TYPES) {
                long count = 0L;
                for (KnowledgeSourceDocumentVO document : loadKnowledgeBaseDocuments(type,
                        knowledgeBase.getKbId()).values()) {
                    if (!knowledgeAccessService.isReadable(permissionUser,
                            KnowledgeRef.of(type, document.getEntityId()))) {
                        continue;
                    }
                    count++;
                    latestUpdateTime = later(latestUpdateTime, document.getSourceUpdatedAt());
                }
                counts.put(type.getValue(), count);
            }
            knowledgeBases.add(KnowledgeStatsVO.KnowledgeBaseStats.builder()
                    .kbId(knowledgeBase.getKbId())
                    .name(knowledgeBase.getName())
                    .role(knowledgeBase.getRole())
                    .counts(counts)
                    .latestUpdateTime(latestUpdateTime)
                    .build());
        }
        return KnowledgeStatsVO.builder().knowledgeBases(knowledgeBases).build();
    }

    private List<KnowledgeSourceDocumentVO> loadDocuments(KnowledgeEntityType type, KnowledgeScopeVO scope) {
        Set<Long> kbIds = new LinkedHashSet<>();
        for (KnowledgeScopeVO.KnowledgeBase knowledgeBase : scope.getKnowledgeBases()) {
            kbIds.add(knowledgeBase.getKbId());
        }
        if (scope.isDefaultScope() && type == KnowledgeEntityType.NOTE) {
            kbIds.add(0L);
        }
        Map<String, KnowledgeSourceDocumentVO> documents = new LinkedHashMap<>();
        for (Long kbId : kbIds) {
            documents.putAll(loadKnowledgeBaseDocuments(type, kbId));
        }
        return new ArrayList<>(documents.values());
    }

    /**
     * 分页读取单个知识库内某类实体的全部元数据。
     *
     * @param type 实体类型
     * @param kbId 知识库 id，未归档笔记为 0
     * @return 以类型与 id 为键的元数据
     */
    private Map<String, KnowledgeSourceDocumentVO> loadKnowledgeBaseDocuments(KnowledgeEntityType type, Long kbId) {
        Map<String, KnowledgeSourceDocumentVO> documents = new LinkedHashMap<>();
        long afterId = 0L;
        while (true) {
            KnowledgeExportVO page = knowledgeEntityService.page(type.getValue(), kbId, afterId, 200, false);
            for (KnowledgeSourceDocumentVO document : page.getDocuments()) {
                documents.put(document.getEntityType() + ":" + document.getEntityId(), document);
            }
            if (!page.isHasMore() || page.getNextAfterId() == null) {
                break;
            }
            afterId = page.getNextAfterId();
        }
        return documents;
    }

    private Date later(Date current, Date candidate) {
        if (candidate == null) {
            return current;
        }
        return current == null || candidate.after(current) ? candidate : current;
    }

    private void validateFilters(KnowledgeEntityType type, KnowledgeQueryName queryName, Map<String, Object> filters) {
        Set<String> allowed = new LinkedHashSet<>(COMMON_FILTERS);
        allowed.addAll(ENTITY_FILTERS.getOrDefault(type, Set.of()));
        if (type == KnowledgeEntityType.TRANSCRIPT || type == KnowledgeEntityType.SUMMARY) {
            allowed.add("moocId");
        }
        if (queryName == KnowledgeQueryName.MY_TASKS) {
            allowed.addAll(MY_TASK_FILTERS);
        }
        for (Map.Entry<String, Object> entry : filters.entrySet()) {
            if (!allowed.contains(entry.getKey()) || entry.getValue() == null) {
                throw invalidQuery();
            }
            validateFilterValue(entry.getKey(), entry.getValue());
        }
        validateDateOrder(filters, "createdAfter", "createdBefore");
        validateDateOrder(filters, "updatedAfter", "updatedBefore");
        validateDateOrder(filters, "deadlineAfter", "deadlineBefore");
    }

    private void validateFilterValue(String key, Object value) {
        switch (key) {
            case "titleContains" -> {
                if (!(value instanceof String text) || text.isBlank() || text.length() > 100) {
                    throw invalidQuery();
                }
            }
            case "createdBy" -> {
                if (!"me".equals(value)) {
                    throw invalidQuery();
                }
            }
            case "createdAfter", "createdBefore", "updatedAfter", "updatedBefore",
                    "deadlineAfter", "deadlineBefore" -> parseDate(value);
            case "submissionStatus" -> {
                try {
                    UserNoteTaskStatus.valueOf(String.valueOf(value));
                } catch (IllegalArgumentException e) {
                    throw invalidQuery();
                }
            }
            case "type" -> requireRange(integer(value), 0, 1);
            case "status" -> requireRange(integer(value), 0, 1);
            case "dataScope" -> requireRange(integer(value), 1, 3);
            case "indexStatus" -> requireRange(integer(value), 0, 4);
            case "moocItemType" -> requireRange(integer(value), 0, 2);
            case "moocId" -> {
                if (integer(value) <= 0) {
                    throw invalidQuery();
                }
            }
            case "parentId" -> {
                if (integer(value) < 0) {
                    throw invalidQuery();
                }
            }
            default -> {
            }
        }
    }

    private boolean matches(KnowledgeSourceDocumentVO document, Map<String, Object> filters,
                            KnowledgeQueryName queryName, Long userId) {
        if (filters.containsKey("titleContains")) {
            String keyword = String.valueOf(filters.get("titleContains"));
            if (document.getTitle() == null || !document.getTitle().contains(keyword)) {
                return false;
            }
        }
        if (filters.containsKey("createdBy") && (document.getAcl() == null
                || !Objects.equals(document.getAcl().getCreateBy(), userId))) {
            return false;
        }
        if (!matchesDate(document.getSourceCreatedAt(), filters, "createdAfter", "createdBefore")
                || !matchesDate(document.getSourceUpdatedAt(), filters, "updatedAfter", "updatedBefore")) {
            return false;
        }
        for (String key : filters.keySet()) {
            if (COMMON_FILTERS.contains(key) || MY_TASK_FILTERS.contains(key)) {
                continue;
            }
            Object actual = document.getAttributes() == null ? null : document.getAttributes().get(key);
            if (actual == null || !Objects.equals(integer(actual), integer(filters.get(key)))) {
                return false;
            }
        }
        return queryName != KnowledgeQueryName.MY_TASKS || matchesDate(
                (Date) document.getAttributes().get("endTime"), filters, "deadlineAfter", "deadlineBefore");
    }

    private boolean matchesDate(Date value, Map<String, Object> filters, String afterKey, String beforeKey) {
        if (filters.containsKey(afterKey)) {
            if (value == null || value.toInstant().isBefore(parseDate(filters.get(afterKey)))) {
                return false;
            }
        }
        if (filters.containsKey(beforeKey)) {
            if (value == null || !value.toInstant().isBefore(parseDate(filters.get(beforeKey)))) {
                return false;
            }
        }
        return true;
    }

    private boolean matchesSubmission(UserNoteTask userTask, Map<String, Object> filters) {
        if (!filters.containsKey("submissionStatus")) {
            return true;
        }
        UserNoteTaskStatus expected = UserNoteTaskStatus.valueOf(String.valueOf(filters.get("submissionStatus")));
        return userTask.getStatus() != null && userTask.getStatus() == expected.getValue();
    }

    private void enrichTask(Map<String, Object> attributes, UserNoteTask userTask) {
        attributes.put("submissionStatus", userTask.getStatus());
        NoteTaskSubmissionRecord submission = submissionRecordMapper.selectOne(
                new LambdaQueryWrapper<NoteTaskSubmissionRecord>()
                        .eq(NoteTaskSubmissionRecord::getNoteTaskId, userTask.getNoteTaskId())
                        .eq(NoteTaskSubmissionRecord::getUserId, userTask.getUserId())
                        .eq(NoteTaskSubmissionRecord::getStatus, NoteTaskSubmissionRecordStatus.NORMAL.getValue())
                        .orderByDesc(NoteTaskSubmissionRecord::getId)
                        .last("LIMIT 1"));
        attributes.put("submissionNoteId", submission == null ? null : submission.getNoteId());
        attributes.put("noteHistoryId", submission == null ? null : submission.getNoteHistoryId());
        attributes.put("submitTime", submission == null ? null : submission.getSubmitTime());
    }

    private Sort parseSort(String value, KnowledgeEntityType type) {
        String actual = value == null || value.isBlank() ? "updatedAt:desc" : value;
        String[] parts = actual.split(":", -1);
        Set<String> allowed = new LinkedHashSet<>(COMMON_SORTS);
        if (type == KnowledgeEntityType.TASK) {
            allowed.add("endTime");
        }
        if (parts.length != 2 || !allowed.contains(parts[0])
                || !("asc".equals(parts[1]) || "desc".equals(parts[1]))) {
            throw invalidQuery();
        }
        return new Sort(parts[0], "asc".equals(parts[1]));
    }

    @SuppressWarnings("unchecked")
    private Comparator<QueryCandidate> comparator(Sort sort) {
        return (left, right) -> {
            Comparable leftValue = sortValue(left.document(), sort.field());
            Comparable rightValue = sortValue(right.document(), sort.field());
            if (leftValue == null || rightValue == null) {
                if (leftValue != rightValue) {
                    return leftValue == null ? 1 : -1;
                }
            } else {
                int compared = sort.ascending() ? leftValue.compareTo(rightValue)
                        : rightValue.compareTo(leftValue);
                if (compared != 0) {
                    return compared;
                }
            }
            return left.document().getRef().compareTo(right.document().getRef());
        };
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Comparable sortValue(KnowledgeSourceDocumentVO document, String field) {
        return switch (field) {
            case "title" -> document.getTitle();
            case "createdAt" -> document.getSourceCreatedAt();
            case "endTime" -> (Date) document.getAttributes().get("endTime");
            default -> document.getSourceUpdatedAt();
        };
    }

    private KnowledgeQueryVO.Row row(QueryCandidate candidate) {
        KnowledgeSourceDocumentVO document = candidate.document();
        return KnowledgeQueryVO.Row.builder()
                .ref(document.getRef())
                .entityType(document.getEntityType())
                .subtype(document.getSubtype())
                .kbId(document.getKbId())
                .parentRef(document.getParentRef())
                .title(document.getTitle())
                .createBy(document.getAcl() == null ? null : document.getAcl().getCreateBy())
                .createTime(document.getSourceCreatedAt())
                .updateTime(document.getSourceUpdatedAt())
                .attributes(candidate.attributes())
                .build();
    }

    private UserNoteTask userTask(Long userId, Long taskId) {
        return userNoteTaskMapper.selectOne(new LambdaQueryWrapper<UserNoteTask>()
                .eq(UserNoteTask::getUserId, userId)
                .eq(UserNoteTask::getNoteTaskId, taskId));
    }

    private void validateDateOrder(Map<String, Object> filters, String afterKey, String beforeKey) {
        if (filters.containsKey(afterKey) && filters.containsKey(beforeKey)
                && parseDate(filters.get(afterKey)).isAfter(parseDate(filters.get(beforeKey)))) {
            throw invalidQuery();
        }
    }

    private Instant parseDate(Object value) {
        String text = String.valueOf(value);
        try {
            if (text.length() == 10) {
                return LocalDate.parse(text).atStartOfDay(ZoneId.systemDefault()).toInstant();
            }
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            throw invalidQuery();
        }
    }

    private int integer(Object value) {
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw invalidQuery();
        }
    }

    private void requireRange(int value, int minimum, int maximum) {
        if (value < minimum || value > maximum) {
            throw invalidQuery();
        }
    }

    private LoginUser asOrdinaryUser(LoginUser loginUser) {
        SysRole role = new SysRole();
        role.setRoleKey("COMMON");
        SysUser sysUser = new SysUser();
        sysUser.setId(loginUser.getUserId());
        sysUser.setRole(role);
        LoginUser ordinary = new LoginUser();
        ordinary.setUserId(loginUser.getUserId());
        ordinary.setSysUser(sysUser);
        return ordinary;
    }

    private BusinessException invalidQuery() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_QUERY, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    private record QueryCandidate(KnowledgeSourceDocumentVO document, Map<String, Object> attributes) {
    }

    private record Sort(String field, boolean ascending) {
    }
}
