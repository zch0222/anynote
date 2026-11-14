package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 知识变更记录实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeChangeServiceImpl implements KnowledgeChangeService {

    private final KnowledgeChangeMapper knowledgeChangeMapper;
    private final DocMapper docMapper;
    private final MoocItemMapper moocItemMapper;
    private final MoocMapper moocMapper;

    /**
     * 构造知识变更服务。
     */
    public KnowledgeChangeServiceImpl(KnowledgeChangeMapper knowledgeChangeMapper, DocMapper docMapper,
                                      MoocItemMapper moocItemMapper, MoocMapper moocMapper) {
        this.knowledgeChangeMapper = knowledgeChangeMapper;
        this.docMapper = docMapper;
        this.moocItemMapper = moocItemMapper;
        this.moocMapper = moocMapper;
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
        return change.getId();
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
        if (status == null || DocIndexStatus.values().length <= status || status < 0) {
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
