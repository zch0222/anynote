package com.anynote.notify.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.notify.constant.NotifyErrorConstants;
import com.anynote.notify.mapper.NoticeMapper;
import com.anynote.notify.model.dto.KnowledgeNoticeBatchDTO;
import com.anynote.notify.model.dto.KnowledgeNoticeExportDTO;
import com.anynote.notify.model.po.KnowledgeNoticeExportPO;
import com.anynote.notify.model.vo.KnowledgeNoticeBatchVO;
import com.anynote.notify.model.vo.KnowledgeNoticeExportVO;
import com.anynote.notify.model.vo.KnowledgeNoticeVO;
import com.anynote.notify.service.KnowledgeNoticeService;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
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
 * 知识库通知导出与批量读取实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeNoticeServiceImpl implements KnowledgeNoticeService {

    private static final String ENTITY_TYPE = "notice";
    private static final String FORMAT_PLAIN_TEXT = "plain_text";
    private static final String AUTHORITY_AUTHORITATIVE = "authoritative";
    private static final String KB_NOTICE_PERMISSIONS = "77400";
    private static final int KB_NOTICE_DATA_SCOPE = 3;
    private static final int DEFAULT_EXPORT_LIMIT = 100;
    private static final int MAX_EXPORT_LIMIT = 200;
    private static final int MAX_BATCH_IDS = 100;

    private final NoticeMapper noticeMapper;

    /**
     * 构造知识库通知导出服务。
     *
     * @param noticeMapper 通知数据访问映射器
     */
    public KnowledgeNoticeServiceImpl(NoticeMapper noticeMapper) {
        this.noticeMapper = noticeMapper;
    }

    @Override
    public KnowledgeNoticeExportVO export(KnowledgeNoticeExportDTO request) {
        if (request == null) {
            throw invalidQueryParam();
        }
        int limit = request.getLimit() == null ? DEFAULT_EXPORT_LIMIT : request.getLimit();
        if (limit < 1 || limit > MAX_EXPORT_LIMIT) {
            throw tooMany();
        }
        long afterId = request.getAfterId() == null ? 0L : request.getAfterId();
        if (afterId < 0) {
            throw invalidQueryParam();
        }
        List<KnowledgeNoticeExportPO> scanned = noticeMapper.selectKnowledgeNoticesPage(afterId, limit + 1);
        boolean hasMore = scanned.size() > limit;
        List<KnowledgeNoticeExportPO> current = scanned.subList(0, Math.min(scanned.size(), limit));
        List<KnowledgeNoticeVO> documents = new ArrayList<>();
        for (KnowledgeNoticeExportPO row : current) {
            if (isActiveKnowledgeNotice(row)) {
                documents.add(toVO(row));
            }
        }
        Long nextAfterId = hasMore && !current.isEmpty() ? current.get(current.size() - 1).getId() : null;
        return KnowledgeNoticeExportVO.builder()
                .documents(documents)
                .nextAfterId(nextAfterId)
                .hasMore(hasMore)
                .build();
    }

    @Override
    public KnowledgeNoticeBatchVO getBatch(KnowledgeNoticeBatchDTO request) {
        if (request == null || request.getIds() == null || request.getIds().isEmpty()) {
            throw invalidQueryParam();
        }
        Set<Long> uniqueIds = new LinkedHashSet<>();
        for (Long id : request.getIds()) {
            if (id == null || id <= 0) {
                throw invalidQueryParam();
            }
            uniqueIds.add(id);
        }
        if (uniqueIds.size() > MAX_BATCH_IDS) {
            throw tooMany();
        }
        List<KnowledgeNoticeExportPO> rows = noticeMapper.selectKnowledgeNoticesByIds(new ArrayList<>(uniqueIds));
        Map<Long, KnowledgeNoticeVO> matched = new LinkedHashMap<>();
        for (KnowledgeNoticeExportPO row : rows) {
            if (isActiveKnowledgeNotice(row)) {
                matched.put(row.getId(), toVO(row));
            }
        }
        List<KnowledgeNoticeVO> documents = new ArrayList<>();
        List<Long> missingIds = new ArrayList<>();
        for (Long id : uniqueIds) {
            KnowledgeNoticeVO vo = matched.get(id);
            if (vo == null) {
                missingIds.add(id);
            } else {
                documents.add(vo);
            }
        }
        return KnowledgeNoticeBatchVO.builder()
                .documents(documents)
                .missingIds(missingIds)
                .build();
    }

    private boolean isActiveKnowledgeNotice(KnowledgeNoticeExportPO row) {
        return row != null
                && Integer.valueOf(1).equals(row.getType())
                && Integer.valueOf(0).equals(row.getStatus())
                && Integer.valueOf(0).equals(row.getDeleted())
                && row.getKnowledgeBaseId() != null
                && row.getKnowledgeBaseId() > 0;
    }

    private KnowledgeNoticeVO toVO(KnowledgeNoticeExportPO row) {
        String body = row.getContent() == null ? "" : row.getContent();
        String ref = ENTITY_TYPE + ":" + row.getId();
        String parentRef = "kb:" + row.getKnowledgeBaseId();
        KnowledgeNoticeVO.Acl acl = KnowledgeNoticeVO.Acl.builder()
                .createBy(row.getCreateBy())
                .permissions(KB_NOTICE_PERMISSIONS)
                .dataScope(KB_NOTICE_DATA_SCOPE)
                .build();
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("level", row.getLevel());
        attributes.put("status", row.getStatus());

        KnowledgeNoticeVO vo = KnowledgeNoticeVO.builder()
                .ref(ref)
                .entityType(ENTITY_TYPE)
                .subtype(null)
                .entityId(row.getId())
                .kbId(row.getKnowledgeBaseId())
                .parentRef(parentRef)
                .title(row.getTitle())
                .format(FORMAT_PLAIN_TEXT)
                .body(body)
                .acl(acl)
                .authority(AUTHORITY_AUTHORITATIVE)
                .contentVersion(sha256(body))
                .attributes(attributes)
                .sourceCreatedAt(row.getCreateTime())
                .sourceUpdatedAt(row.getUpdateTime())
                .build();
        vo.setMetaVersion(computeMetaVersion(vo));
        return vo;
    }

    private String computeMetaVersion(KnowledgeNoticeVO vo) {
        KnowledgeNoticeVO.Acl acl = vo.getAcl();
        String canonical = lengthPrefixed(vo.getRef())
                + lengthPrefixed(vo.getEntityType())
                + lengthPrefixed(vo.getKbId())
                + lengthPrefixed(vo.getParentRef())
                + lengthPrefixed(vo.getTitle())
                + lengthPrefixed(vo.getFormat())
                + lengthPrefixed(vo.getAuthority())
                + lengthPrefixed(acl == null ? null : acl.getCreateBy())
                + lengthPrefixed(acl == null ? null : acl.getPermissions())
                + lengthPrefixed(acl == null ? null : acl.getDataScope())
                + lengthPrefixed(canonicalAttributes(vo.getAttributes()));
        return sha256(canonical);
    }

    private String canonicalAttributes(Map<String, Object> attributes) {
        if (attributes == null || attributes.isEmpty()) {
            return "";
        }
        Map<String, Object> sorted = new TreeMap<>(attributes);
        StringBuilder sb = new StringBuilder();
        sorted.forEach((key, value) -> {
            Object normalized = value instanceof Date date ? date.getTime() : value;
            sb.append(lengthPrefixed(key)).append(lengthPrefixed(normalized));
        });
        return sb.toString();
    }

    private String lengthPrefixed(Object value) {
        String text = Objects.toString(value, null);
        return text == null ? "-1:" : text.length() + ":" + text;
    }

    private static String sha256(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private BusinessException invalidQueryParam() {
        return new BusinessException(NotifyErrorConstants.INVALID_QUERY_PARAM, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    private BusinessException tooMany() {
        return new BusinessException(NotifyErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
