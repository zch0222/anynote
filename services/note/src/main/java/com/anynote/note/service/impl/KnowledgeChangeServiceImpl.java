package com.anynote.note.service.impl;

import com.alibaba.fastjson2.JSON;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.dto.KnowledgeChangeRecordDTO;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.DocIndexStatus;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.KnowledgeChangeMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.model.po.KnowledgeChangePO;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.vo.KnowledgeChangePageVO;
import com.anynote.note.service.KnowledgeChangeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 知识变更记录实现。
 *
 * @author 称霸幼儿园
 */
@Slf4j
@Service
public class KnowledgeChangeServiceImpl implements KnowledgeChangeService {

    /**
     * Redis 索引增量唤醒频道。
     */
    public static final String CHANGE_WAKEUP_CHANNEL = "anynote:knowledge:change";

    private final KnowledgeChangeMapper knowledgeChangeMapper;
    private final DocMapper docMapper;
    private final MoocItemMapper moocItemMapper;
    private final MoocMapper moocMapper;
    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;

    /**
     * 构造知识变更服务（无 Redis 唤醒提供者，用于兼容既有单元测试）。
     */
    public KnowledgeChangeServiceImpl(KnowledgeChangeMapper knowledgeChangeMapper, DocMapper docMapper,
                                      MoocItemMapper moocItemMapper, MoocMapper moocMapper) {
        this(knowledgeChangeMapper, docMapper, moocItemMapper, moocMapper, null);
    }

    /**
     * 构造知识变更服务。
     *
     * @param knowledgeChangeMapper 知识变更 Mapper
     * @param docMapper 资料 Mapper
     * @param moocItemMapper 慕课条目 Mapper
     * @param moocMapper 慕课 Mapper
     * @param redisTemplateProvider Redis 模板延迟提供者，可为空
     */
    @Autowired
    public KnowledgeChangeServiceImpl(KnowledgeChangeMapper knowledgeChangeMapper, DocMapper docMapper,
                                      MoocItemMapper moocItemMapper, MoocMapper moocMapper,
                                      ObjectProvider<StringRedisTemplate> redisTemplateProvider) {
        this.knowledgeChangeMapper = knowledgeChangeMapper;
        this.docMapper = docMapper;
        this.moocItemMapper = moocItemMapper;
        this.moocMapper = moocMapper;
        this.redisTemplateProvider = redisTemplateProvider;
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public Long record(KnowledgeEntityType entityType, Long entityId, Long knowledgeBaseId,
                       KnowledgeOperation operation) {
        if (entityType == null || entityId == null || entityId <= 0 || operation == null) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        KnowledgeChangePO change = KnowledgeChangePO.builder()
                .entityType(entityType.getValue())
                .entityId(entityId)
                .knowledgeBaseId(knowledgeBaseId == null ? 0L : knowledgeBaseId)
                .operation(operation.name())
                .build();
        int inserted = knowledgeChangeMapper.insert(change);
        if (inserted != 1) {
            throw new BusinessException(ResCode.BUSINESS_ERROR);
        }
        publishWakeupAfterCommit(change);
        return change.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public Long record(KnowledgeChangeRecordDTO request) {
        if (request == null || request.getKnowledgeBaseId() != null && request.getKnowledgeBaseId() < 0) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        KnowledgeEntityType entityType = KnowledgeEntityType.parse(request.getEntityType());
        KnowledgeOperation operation = parseOperation(request.getOperation());
        return record(entityType, request.getEntityId(), request.getKnowledgeBaseId(), operation);
    }

    @Override
    public KnowledgeChangePageVO changes(long afterId, int limit) {
        if (afterId < 0) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_CONTENT_RANGE,
                    ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (limit < 1 || limit > 500) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        List<KnowledgeChangePageVO.Change> changes = knowledgeChangeMapper.selectAfter(afterId, limit).stream()
                .map(this::change)
                .toList();
        KnowledgeChangePO latest = knowledgeChangeMapper.selectLatest();
        long nextCursor = changes.isEmpty() ? afterId : changes.get(changes.size() - 1).getId();
        return KnowledgeChangePageVO.builder()
                .changes(changes)
                .nextCursor(nextCursor)
                .latestCursor(latest == null ? 0L : latest.getId())
                .build();
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public void updateDocIndexStatus(Long docId, Integer status) {
        if (!DocIndexStatus.contains(status)) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_INDEX_STATUS,
                    ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (docId == null || docId <= 0) {
            throw notReadable();
        }
        int updated = docMapper.updateById(Doc.builder().id(docId).indexStatus(status).build());
        if (updated != 1) {
            throw notReadable();
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public Long recordSummaryChange(Long moocItemId) {
        if (moocItemId == null || moocItemId <= 0) {
            throw notReadable();
        }
        MoocItemPO item = moocItemMapper.selectById(moocItemId);
        if (item == null) {
            throw notReadable();
        }
        MoocPO mooc = moocMapper.selectById(item.getMoocId());
        if (mooc == null) {
            throw notReadable();
        }
        return record(KnowledgeEntityType.SUMMARY, moocItemId, mooc.getKnowledgeBaseId(), KnowledgeOperation.UPDATE);
    }

    private KnowledgeOperation parseOperation(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        try {
            return KnowledgeOperation.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private void publishWakeupAfterCommit(KnowledgeChangePO change) {
        Runnable action = () -> {
            if (redisTemplateProvider == null) {
                return;
            }
            StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
            if (redisTemplate == null) {
                return;
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", change.getId());
            payload.put("entityType", change.getEntityType());
            payload.put("entityId", change.getEntityId());
            payload.put("kbId", change.getKnowledgeBaseId());
            payload.put("operation", change.getOperation());
            try {
                redisTemplate.convertAndSend(CHANGE_WAKEUP_CHANNEL, JSON.toJSONString(payload));
            } catch (RuntimeException e) {
                log.warn("知识变更 {} 发布 Redis 唤醒失败，将由定时轮询兜底: {}", change.getId(), e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }

    private KnowledgeChangePageVO.Change change(KnowledgeChangePO po) {
        return KnowledgeChangePageVO.Change.builder()
                .id(po.getId())
                .entityType(po.getEntityType())
                .entityId(po.getEntityId())
                .kbId(po.getKnowledgeBaseId())
                .operation(po.getOperation())
                .createTime(po.getCreateTime())
                .build();
    }

    private BusinessException notReadable() {
        return new BusinessException(KnowledgeErrorConstants.NOT_READABLE, ResCode.INVALID_USER_INPUT_NOT_FOUND);
    }
}
