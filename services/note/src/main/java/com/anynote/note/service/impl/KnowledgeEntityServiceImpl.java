package com.anynote.note.service.impl;

import com.anynote.ai.api.RemoteMoocVideoSummarizeService;
import com.anynote.ai.api.model.dto.GetMoocVideoSummarizesByMoocIdDTO;
import com.anynote.ai.api.model.po.MoocVideoSummarizePO;
import com.anynote.core.constant.SecurityConstants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.model.po.FilePO;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteKnowledgeBase;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.api.model.po.NoteText;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.constant.MoocItemType;
import com.anynote.note.enums.NoteTaskPermissions;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.KnowledgeBaseMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocItemTextMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.mapper.MoocVideoItemInfoMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.mapper.NoteTextMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocItemTextPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.po.MoocVideoItemInfoPO;
import com.anynote.note.model.vo.KnowledgeDocumentBatchVO;
import com.anynote.note.model.vo.KnowledgeExportVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeEntityService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;

/**
 * 知识权威实体读取实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeEntityServiceImpl implements KnowledgeEntityService {

    private final KnowledgeBaseMapper knowledgeBaseMapper;
    private final NoteMapper noteMapper;
    private final NoteTextMapper noteTextMapper;
    private final DocMapper docMapper;
    private final MoocMapper moocMapper;
    private final MoocItemMapper moocItemMapper;
    private final MoocItemTextMapper moocItemTextMapper;
    private final MoocVideoItemInfoMapper moocVideoItemInfoMapper;
    private final NoteTaskMapper noteTaskMapper;
    private final UserNoteTaskMapper userNoteTaskMapper;
    private final RemoteFileService remoteFileService;
    private final RemoteMoocVideoSummarizeService remoteMoocVideoSummarizeService;

    /**
     * 构造知识实体读取服务。
     */
    public KnowledgeEntityServiceImpl(KnowledgeBaseMapper knowledgeBaseMapper,
                                      NoteMapper noteMapper,
                                      NoteTextMapper noteTextMapper,
                                      DocMapper docMapper,
                                      MoocMapper moocMapper,
                                      MoocItemMapper moocItemMapper,
                                      MoocItemTextMapper moocItemTextMapper,
                                      MoocVideoItemInfoMapper moocVideoItemInfoMapper,
                                      NoteTaskMapper noteTaskMapper,
                                      UserNoteTaskMapper userNoteTaskMapper,
                                      RemoteFileService remoteFileService,
                                      RemoteMoocVideoSummarizeService remoteMoocVideoSummarizeService) {
        this.knowledgeBaseMapper = knowledgeBaseMapper;
        this.noteMapper = noteMapper;
        this.noteTextMapper = noteTextMapper;
        this.docMapper = docMapper;
        this.moocMapper = moocMapper;
        this.moocItemMapper = moocItemMapper;
        this.moocItemTextMapper = moocItemTextMapper;
        this.moocVideoItemInfoMapper = moocVideoItemInfoMapper;
        this.noteTaskMapper = noteTaskMapper;
        this.userNoteTaskMapper = userNoteTaskMapper;
        this.remoteFileService = remoteFileService;
        this.remoteMoocVideoSummarizeService = remoteMoocVideoSummarizeService;
    }

    @Override
    public KnowledgeSourceDocumentVO get(KnowledgeRef ref, boolean includeBody) {
        return switch (ref.getType()) {
            case KNOWLEDGE_BASE -> knowledgeBase(ref.getId(), includeBody);
            case NOTE -> note(ref.getId(), includeBody);
            case DOC -> doc(ref.getId());
            case MOOC -> mooc(ref.getId(), includeBody);
            case MOOC_ITEM -> moocItem(ref.getId(), includeBody);
            case TRANSCRIPT -> transcript(ref.getId(), includeBody);
            case SUMMARY -> summary(ref.getId(), includeBody);
            case TASK -> task(ref.getId(), includeBody);
            case NOTICE -> null;
        };
    }

    @Override
    public KnowledgeExportVO export(String entityType, Long kbId, Long afterId, int limit) {
        return page(entityType, kbId, afterId, limit, true);
    }

    @Override
    public KnowledgeExportVO page(String entityType, Long kbId, Long afterId, int limit, boolean includeBody) {
        KnowledgeEntityType type = KnowledgeEntityType.parse(entityType);
        long cursor = afterId == null ? 0L : afterId;
        List<?> scanned = switch (type) {
            case KNOWLEDGE_BASE -> page(knowledgeBaseMapper, NoteKnowledgeBase::getId, null,
                    NoteKnowledgeBase::getStatus, kbId, cursor, limit);
            case NOTE -> page(noteMapper, Note::getId, Note::getKnowledgeBaseId,
                    Note::getStatus, kbId, cursor, limit);
            case DOC -> page(docMapper, Doc::getId, Doc::getKnowledgeBaseId, null, kbId, cursor, limit);
            case MOOC -> page(moocMapper, MoocPO::getId, MoocPO::getKnowledgeBaseId, null, kbId, cursor, limit);
            case MOOC_ITEM -> moocItemPage(kbId, cursor, limit, null);
            case TRANSCRIPT, SUMMARY -> moocItemPage(kbId, cursor, limit, MoocItemType.VIDEO);
            case TASK -> page(noteTaskMapper, NoteTask::getId, NoteTask::getKnowledgeBaseId, null, kbId, cursor, limit);
            case NOTICE -> throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY,
                    ResCode.USER_REQUEST_PARAM_ERROR);
        };
        boolean hasMore = scanned.size() > limit;
        List<?> current = new ArrayList<>(scanned.subList(0, Math.min(scanned.size(), limit)));
        List<KnowledgeSourceDocumentVO> documents = new ArrayList<>();
        for (Object entity : current) {
            Long id = entityId(entity);
            KnowledgeSourceDocumentVO document = get(KnowledgeRef.of(type, id), includeBody);
            if (document != null) {
                documents.add(document);
            }
        }
        Long nextAfterId = hasMore && !current.isEmpty() ? entityId(current.get(current.size() - 1)) : null;
        return KnowledgeExportVO.builder()
                .documents(documents)
                .nextAfterId(nextAfterId)
                .hasMore(hasMore)
                .build();
    }

    @Override
    public KnowledgeDocumentBatchVO getBatch(List<String> refs, boolean includeBody) {
        if (refs == null || refs.isEmpty()) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (refs.size() > 100) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        List<KnowledgeSourceDocumentVO> documents = new ArrayList<>();
        List<String> missingRefs = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String rawRef : refs) {
            KnowledgeRef parsed = KnowledgeRef.parseCombined(rawRef);
            String dedupKey = parsed.ref() + (parsed.subtype() == null ? "" : "#" + parsed.subtype());
            if (!seen.add(dedupKey)) {
                continue;
            }
            KnowledgeSourceDocumentVO document = get(parsed, includeBody);
            if (document == null) {
                missingRefs.add(rawRef);
            } else {
                documents.add(document);
            }
        }
        return KnowledgeDocumentBatchVO.builder()
                .documents(documents)
                .missingRefs(missingRefs)
                .build();
    }

    private KnowledgeSourceDocumentVO knowledgeBase(Long id, boolean includeBody) {
        NoteKnowledgeBase knowledgeBase = knowledgeBaseMapper.selectById(id);
        if (knowledgeBase == null || knowledgeBase.getStatus() != null && knowledgeBase.getStatus() != 0) {
            return null;
        }
        String body = knowledgeBase.getDetail() == null ? "" : knowledgeBase.getDetail();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.KNOWLEDGE_BASE, id).ref())
                .entityType(KnowledgeEntityType.KNOWLEDGE_BASE.getValue())
                .entityId(id)
                .kbId(id)
                .title(knowledgeBase.getName())
                .format("plain")
                .body(includeBody ? body : null)
                .acl(acl(knowledgeBase.getCreateBy(), null, null))
                .authority("original")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("type", knowledgeBase.getType(), "status", knowledgeBase.getStatus()))
                .sourceCreatedAt(knowledgeBase.getCreateTime())
                .sourceUpdatedAt(knowledgeBase.getUpdateTime())
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO note(Long id, boolean includeBody) {
        Note note = noteMapper.selectById(id);
        if (note == null || note.getStatus() != null && note.getStatus() != 0) {
            return null;
        }
        NoteText noteText = noteTextMapper.selectById(note.getNoteTextId());
        if (noteText == null) {
            return null;
        }
        String body = noteText.getContent() == null ? "" : noteText.getContent();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.NOTE, id).ref())
                .entityType(KnowledgeEntityType.NOTE.getValue())
                .entityId(id)
                .kbId(kbId(note.getKnowledgeBaseId()))
                .title(note.getTitle())
                .format("markdown")
                .body(includeBody ? body : null)
                .acl(acl(note.getCreateBy(), note.getPermissions(), note.getDataScope()))
                .authority("original")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("status", note.getStatus(), "dataScope", note.getDataScope()))
                .sourceCreatedAt(note.getCreateTime())
                .sourceUpdatedAt(latest(note.getUpdateTime(), noteText.getUpdateTime()))
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO doc(Long id) {
        Doc doc = docMapper.selectById(id);
        if (doc == null) {
            return null;
        }
        FilePO file = file(doc.getFileId());
        String objectName = file.getObjectName();
        String contentVersion = file.getHash() == null || file.getHash().isBlank()
                ? sha256(Objects.toString(objectName, "")) : file.getHash();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.DOC, id).ref())
                .entityType(KnowledgeEntityType.DOC.getValue())
                .entityId(id)
                .kbId(kbId(doc.getKnowledgeBaseId()))
                .title(doc.getName())
                .format("pdf")
                .objectName(objectName)
                .contentUrl(file.getUrl())
                .acl(acl(doc.getCreateBy(), doc.getPermissions(), doc.getDataScope()))
                .authority("original")
                .contentVersion(contentVersion)
                .attributes(attributes("type", doc.getType(), "indexStatus", doc.getIndexStatus(),
                        "dataScope", doc.getDataScope()))
                .sourceCreatedAt(doc.getCreateTime())
                .sourceUpdatedAt(doc.getUpdateTime())
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO mooc(Long id, boolean includeBody) {
        MoocPO mooc = moocMapper.selectById(id);
        if (mooc == null) {
            return null;
        }
        String body = mooc.getMoocDescription() == null ? "" : mooc.getMoocDescription();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.MOOC, id).ref())
                .entityType(KnowledgeEntityType.MOOC.getValue())
                .entityId(id)
                .kbId(kbId(mooc.getKnowledgeBaseId()))
                .title(mooc.getTitle())
                .format("plain")
                .body(includeBody ? body : null)
                .acl(acl(mooc.getCreateBy(), mooc.getPermissions(), mooc.getDataScope()))
                .authority("original")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("dataScope", mooc.getDataScope()))
                .sourceCreatedAt(mooc.getCreateTime())
                .sourceUpdatedAt(mooc.getUpdateTime())
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO moocItem(Long id, boolean includeBody) {
        MoocItemPO item = moocItemMapper.selectById(id);
        if (item == null) {
            return null;
        }
        MoocPO mooc = moocMapper.selectById(item.getMoocId());
        if (mooc == null) {
            return null;
        }
        MoocItemTextPO itemText = moocItemTextMapper.selectList(new LambdaQueryWrapper<MoocItemTextPO>()
                        .eq(MoocItemTextPO::getMoocItemId, id)
                        .orderByDesc(MoocItemTextPO::getUpdateTime)
                        .orderByDesc(MoocItemTextPO::getId)
                        .last("LIMIT 1"))
                .stream().findFirst().orElse(null);
        String body = itemText == null || itemText.getItemText() == null ? "" : itemText.getItemText();
        KnowledgeEntityType type = KnowledgeEntityType.MOOC_ITEM;
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(type, id).ref())
                .entityType(type.getValue())
                .entityId(id)
                .kbId(kbId(mooc.getKnowledgeBaseId()))
                .parentRef(parentRef(item))
                .title(item.getTitle())
                .format(Objects.equals(item.getMoocItemType(), MoocItemType.DOC) ? "markdown" : "plain")
                .body(includeBody ? body : null)
                .objectName(item.getObjectName())
                .acl(acl(mooc.getCreateBy(), mooc.getPermissions(), mooc.getDataScope()))
                .authority("original")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("moocId", item.getMoocId(), "parentId", item.getParentId(),
                        "moocItemType", item.getMoocItemType()))
                .sourceCreatedAt(item.getCreateTime())
                .sourceUpdatedAt(latest(item.getUpdateTime(), itemText == null ? null : itemText.getUpdateTime()))
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO transcript(Long id, boolean includeBody) {
        MoocItemPO item = moocItemMapper.selectById(id);
        if (item == null || !Objects.equals(item.getMoocItemType(), MoocItemType.VIDEO)) {
            return null;
        }
        MoocPO mooc = moocMapper.selectById(item.getMoocId());
        MoocVideoItemInfoPO info = moocVideoItemInfoMapper.selectOne(new LambdaQueryWrapper<MoocVideoItemInfoPO>()
                .eq(MoocVideoItemInfoPO::getMoocItemId, id));
        if (mooc == null || info == null || info.getSrtObjectName() == null || info.getSrtObjectName().isBlank()) {
            return null;
        }
        String body = includeBody ? readTranscript(info.getSrtObjectName()) : null;
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.TRANSCRIPT, id).ref())
                .entityType(KnowledgeEntityType.TRANSCRIPT.getValue())
                .subtype(KnowledgeEntityType.TRANSCRIPT.getValue())
                .entityId(id)
                .kbId(kbId(mooc.getKnowledgeBaseId()))
                .parentRef(KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, id).ref())
                .title(item.getTitle())
                .format("srt")
                .body(body)
                .objectName(info.getSrtObjectName())
                .acl(acl(mooc.getCreateBy(), mooc.getPermissions(), mooc.getDataScope()))
                .authority("transcript")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("moocId", item.getMoocId()))
                .sourceCreatedAt(info.getCreateTime())
                .sourceUpdatedAt(latest(item.getUpdateTime(), info.getUpdateTime()))
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO summary(Long id, boolean includeBody) {
        MoocItemPO item = moocItemMapper.selectById(id);
        if (item == null || !Objects.equals(item.getMoocItemType(), MoocItemType.VIDEO)) {
            return null;
        }
        MoocPO mooc = moocMapper.selectById(item.getMoocId());
        if (mooc == null) {
            return null;
        }
        List<MoocVideoSummarizePO> summaries = summaries(item.getMoocId(), id);
        if (summaries.isEmpty()) {
            return null;
        }
        MoocVideoSummarizePO summary = summaries.stream()
                .max(Comparator.comparing(MoocVideoSummarizePO::getCreateTime, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(MoocVideoSummarizePO::getId, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElseThrow();
        String body = summary.getContent() == null ? "" : summary.getContent();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.SUMMARY, id).ref())
                .entityType(KnowledgeEntityType.SUMMARY.getValue())
                .subtype(KnowledgeEntityType.SUMMARY.getValue())
                .entityId(id)
                .kbId(kbId(mooc.getKnowledgeBaseId()))
                .parentRef(KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, id).ref())
                .title(item.getTitle())
                .format("plain")
                .body(includeBody ? body : null)
                .acl(acl(mooc.getCreateBy(), mooc.getPermissions(), mooc.getDataScope()))
                .authority("generated")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("moocId", item.getMoocId(), "summaryId", summary.getId(),
                        "model", summary.getModel()))
                .sourceCreatedAt(summary.getCreateTime())
                .sourceUpdatedAt(summary.getUpdateTime())
                .build();
        return withMetaVersion(document);
    }

    private KnowledgeSourceDocumentVO task(Long id, boolean includeBody) {
        NoteTask task = noteTaskMapper.selectById(id);
        if (task == null) {
            return null;
        }
        String body = task.getTaskDescribe() == null ? "" : task.getTaskDescribe();
        KnowledgeSourceDocumentVO document = KnowledgeSourceDocumentVO.builder()
                .ref(KnowledgeRef.of(KnowledgeEntityType.TASK, id).ref())
                .entityType(KnowledgeEntityType.TASK.getValue())
                .entityId(id)
                .kbId(kbId(task.getKnowledgeBaseId()))
                .title(task.getTaskName())
                .format("plain")
                .body(includeBody ? body : null)
                .acl(KnowledgeSourceDocumentVO.Acl.builder()
                        .createBy(task.getCreateBy())
                        .taskMemberIds(taskMemberIds(id))
                        .build())
                .authority("original")
                .contentVersion(includeBody ? sha256(body) : null)
                .attributes(attributes("status", task.getStatus(), "startTime", task.getStartTime(),
                        "endTime", task.getEndTime()))
                .sourceCreatedAt(task.getCreateTime())
                .sourceUpdatedAt(task.getUpdateTime())
                .build();
        return withMetaVersion(document);
    }

    private <T> List<T> page(BaseMapper<T> mapper, SFunction<T, Long> id,
                             SFunction<T, Long> kb, SFunction<T, Integer> status,
                             Long requestedKbId, long afterId, int limit) {
        LambdaQueryWrapper<T> wrapper = new LambdaQueryWrapper<T>()
                .gt(id, afterId)
                .eq(requestedKbId != null, kb == null ? id : kb, requestedKbId)
                .eq(status != null, status, 0)
                .orderByAsc(id)
                .last("LIMIT " + (limit + 1));
        return mapper.selectList(wrapper);
    }

    private List<MoocItemPO> moocItemPage(Long requestedKbId, long afterId, int limit, Integer itemType) {
        LambdaQueryWrapper<MoocItemPO> wrapper = new LambdaQueryWrapper<MoocItemPO>()
                .gt(MoocItemPO::getId, afterId)
                .eq(itemType != null, MoocItemPO::getMoocItemType, itemType)
                .orderByAsc(MoocItemPO::getId)
                .last("LIMIT " + (limit + 1));
        if (requestedKbId != null) {
            List<Long> moocIds = moocMapper.selectList(new LambdaQueryWrapper<MoocPO>()
                            .eq(MoocPO::getKnowledgeBaseId, requestedKbId)
                            .select(MoocPO::getId))
                    .stream().map(MoocPO::getId).toList();
            if (moocIds.isEmpty()) {
                return List.of();
            }
            wrapper.in(MoocItemPO::getMoocId, moocIds);
        }
        return moocItemMapper.selectList(wrapper);
    }

    private Long entityId(Object entity) {
        if (entity instanceof NoteKnowledgeBase value) return value.getId();
        if (entity instanceof Note value) return value.getId();
        if (entity instanceof Doc value) return value.getId();
        if (entity instanceof MoocPO value) return value.getId();
        if (entity instanceof MoocItemPO value) return value.getId();
        if (entity instanceof NoteTask value) return value.getId();
        throw new IllegalArgumentException("Unsupported entity");
    }

    private FilePO file(Long fileId) {
        ResData<FilePO> response = remoteFileService.getFileById(fileId, SecurityConstants.INNER);
        if (response == null || response.getData() == null || !ResData.SUCCESS.equals(response.getCode())) {
            throw new BusinessException(KnowledgeErrorConstants.READ_FILE_FAILED, ResCode.INNER_FILE_SERVICE_ERROR);
        }
        return response.getData();
    }

    private String readTranscript(String objectName) {
        ResData<String> response = remoteFileService.readTextFile(objectName, SecurityConstants.INNER);
        if (response == null || response.getData() == null || !ResData.SUCCESS.equals(response.getCode())) {
            throw new BusinessException(KnowledgeErrorConstants.READ_TRANSCRIPT_FAILED, ResCode.INNER_FILE_SERVICE_ERROR);
        }
        return response.getData();
    }

    private List<MoocVideoSummarizePO> summaries(Long moocId, Long moocItemId) {
        GetMoocVideoSummarizesByMoocIdDTO request = new GetMoocVideoSummarizesByMoocIdDTO();
        request.setMoocId(moocId);
        request.setMoocItemId(moocItemId);
        ResData<List<MoocVideoSummarizePO>> response = remoteMoocVideoSummarizeService
                .getMoocVideoSummarizesByMoocItemId(SecurityConstants.INNER, request);
        if (response == null || response.getData() == null || !ResData.SUCCESS.equals(response.getCode())) {
            throw new BusinessException(KnowledgeErrorConstants.READ_SUMMARY_FAILED, ResCode.INNER_SERVICE_ERROR);
        }
        return response.getData();
    }

    private String parentRef(MoocItemPO item) {
        if (item.getParentId() != null && item.getParentId() > 0) {
            return KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, item.getParentId()).ref();
        }
        return KnowledgeRef.of(KnowledgeEntityType.MOOC, item.getMoocId()).ref();
    }

    private String metadataAttributes(Map<String, Object> attributes) {
        if (attributes == null) {
            return "";
        }
        Map<String, Object> sorted = new TreeMap<>(attributes);
        sorted.remove("indexStatus");
        StringBuilder canonical = new StringBuilder();
        sorted.forEach((key, value) -> {
            Object normalized = value instanceof Date date ? date.getTime() : value;
            canonical.append(lengthPrefixed(key)).append(lengthPrefixed(normalized));
        });
        return canonical.toString();
    }

    private Map<String, Object> attributes(Object... values) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) {
            attributes.put((String) values[i], values[i + 1]);
        }
        return attributes;
    }

    /**
     * 读取任务的有效成员（管理或提交权限），升序去重。
     *
     * @param taskId 任务 id
     * @return 成员用户 id 列表
     */
    private List<Long> taskMemberIds(Long taskId) {
        List<UserNoteTask> rows = userNoteTaskMapper.selectList(new LambdaQueryWrapper<UserNoteTask>()
                .eq(UserNoteTask::getNoteTaskId, taskId)
                .in(UserNoteTask::getPermissions, NoteTaskPermissions.MANAGE.getValue(),
                        NoteTaskPermissions.SUBMIT.getValue()));
        if (rows == null) {
            return List.of();
        }
        return rows.stream()
                .map(UserNoteTask::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    }

    private KnowledgeSourceDocumentVO.Acl acl(Long createBy, String permissions, Integer dataScope) {
        return KnowledgeSourceDocumentVO.Acl.builder()
                .createBy(createBy)
                .permissions(permissions)
                .dataScope(dataScope)
                .build();
    }

    private KnowledgeSourceDocumentVO withMetaVersion(KnowledgeSourceDocumentVO document) {
        KnowledgeSourceDocumentVO.Acl acl = document.getAcl();
        String canonical = lengthPrefixed(document.getRef())
                + lengthPrefixed(document.getEntityType())
                + lengthPrefixed(document.getKbId())
                + lengthPrefixed(document.getParentRef())
                + lengthPrefixed(document.getTitle())
                + lengthPrefixed(document.getFormat())
                + lengthPrefixed(document.getAuthority())
                + lengthPrefixed(acl == null ? null : acl.getCreateBy())
                + lengthPrefixed(acl == null ? null : acl.getPermissions())
                + lengthPrefixed(acl == null ? null : acl.getDataScope())
                + lengthPrefixed(acl == null || acl.getTaskMemberIds() == null ? null
                        : acl.getTaskMemberIds().toString())
                + lengthPrefixed(metadataAttributes(document.getAttributes()));
        document.setMetaVersion(sha256(canonical));
        return document;
    }

    private String lengthPrefixed(Object value) {
        String text = Objects.toString(value, null);
        return text == null ? "-1:" : text.length() + ":" + text;
    }

    private long kbId(Long value) {
        return value == null ? 0L : value;
    }

    private Date latest(Date first, Date second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.after(second) ? first : second;
    }

    /**
     * 计算文本的 SHA-256。
     *
     * @param content 文本内容
     * @return 十六进制摘要
     */
    static String sha256(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
