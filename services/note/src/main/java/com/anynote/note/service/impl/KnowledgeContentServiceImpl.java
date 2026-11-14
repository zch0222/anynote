package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeContentDTO;
import com.anynote.note.model.vo.KnowledgeContentVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeContentService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.note.utils.KnowledgeMarkdownUtil;
import com.anynote.system.api.model.bo.LoginUser;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 权威正文范围读取实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeContentServiceImpl implements KnowledgeContentService {

    static final int MAX_CONTENT_LENGTH = 20_000;
    private static final Pattern SRT_TIME = Pattern.compile("(\\d+):(\\d{2}):(\\d{2}),(\\d{3})");

    private final KnowledgeEntityService knowledgeEntityService;
    private final KnowledgeAccessService knowledgeAccessService;

    /**
     * 构造正文读取服务。
     *
     * @param knowledgeEntityService 权威实体读取服务
     * @param knowledgeAccessService 权限服务
     */
    public KnowledgeContentServiceImpl(KnowledgeEntityService knowledgeEntityService,
                                       KnowledgeAccessService knowledgeAccessService) {
        this.knowledgeEntityService = knowledgeEntityService;
        this.knowledgeAccessService = knowledgeAccessService;
    }

    @Override
    public KnowledgeContentVO read(LoginUser loginUser, KnowledgeContentDTO request) {
        if (request == null) {
            throw invalidEntity();
        }
        KnowledgeRef ref = KnowledgeRef.parse(request.getRef(), request.getSubtype());
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(ref, true);
        if (document == null || !knowledgeAccessService.isReadable(loginUser, ref)) {
            throw new BusinessException(KnowledgeErrorConstants.NOT_READABLE, ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
        if (ref.getType() == KnowledgeEntityType.DOC) {
            throw invalidEntity();
        }
        String selected = select(document, request);
        int offset = request.getOffset() == null ? 0 : request.getOffset();
        if (offset < 0 || offset > selected.length()) {
            throw invalidRange();
        }
        int end = Math.min(selected.length(), offset + MAX_CONTENT_LENGTH);
        boolean truncated = end < selected.length();
        return KnowledgeContentVO.builder()
                .ref(document.getRef())
                .entityType(document.getEntityType())
                .subtype(document.getSubtype())
                .kbId(document.getKbId())
                .title(document.getTitle())
                .format(document.getFormat())
                .authority(document.getAuthority())
                .contentVersion(document.getContentVersion())
                .metaVersion(document.getMetaVersion())
                .content(selected.substring(offset, end))
                .truncated(truncated)
                .nextOffset(truncated ? end : null)
                .build();
    }

    private String select(KnowledgeSourceDocumentVO document, KnowledgeContentDTO request) {
        String body = document.getBody() == null ? "" : document.getBody();
        boolean hasLines = request.getStartLine() != null || request.getEndLine() != null;
        boolean hasTimes = request.getStartTimeMs() != null || request.getEndTimeMs() != null;
        int selectors = (request.getHeading() != null ? 1 : 0) + (hasLines ? 1 : 0) + (hasTimes ? 1 : 0);
        if (selectors > 1) {
            throw invalidRange();
        }
        if ("markdown".equals(document.getFormat())) {
            if (hasTimes) {
                throw invalidRange();
            }
            if (request.getHeading() != null) {
                if (request.getHeading().isBlank()) {
                    throw invalidRange();
                }
                String section = KnowledgeMarkdownUtil.headingSection(body, request.getHeading());
                if (section == null) {
                    throw invalidRange();
                }
                return section;
            }
            if (hasLines) {
                if (request.getStartLine() == null || request.getEndLine() == null) {
                    throw invalidRange();
                }
                String range = KnowledgeMarkdownUtil.lineRange(body, request.getStartLine(), request.getEndLine());
                if (range == null) {
                    throw invalidRange();
                }
                return range;
            }
            return body;
        }
        if ("srt".equals(document.getFormat())) {
            if (request.getHeading() != null || hasLines) {
                throw invalidRange();
            }
            return selectSrt(body, request.getStartTimeMs(), request.getEndTimeMs());
        }
        if (request.getHeading() != null || hasLines || hasTimes) {
            throw invalidRange();
        }
        return body;
    }

    private String selectSrt(String content, Long startTimeMs, Long endTimeMs) {
        long start = startTimeMs == null ? 0L : startTimeMs;
        long end = endTimeMs == null ? Long.MAX_VALUE : endTimeMs;
        if (start < 0 || end < start) {
            throw invalidRange();
        }
        List<String> selected = new ArrayList<>();
        for (String block : content.split("(?:\\r\\n|\\r|\\n){2}", -1)) {
            String[] lines = block.split("\\r\\n|\\r|\\n");
            for (String line : lines) {
                String[] parts = line.split("-->");
                if (parts.length != 2) {
                    continue;
                }
                Long cueStart = parseSrtTime(parts[0].trim());
                Long cueEnd = parseSrtTime(parts[1].trim());
                if (cueStart != null && cueEnd != null && cueStart <= end && cueEnd >= start) {
                    selected.add(block);
                }
                break;
            }
        }
        return String.join("\n\n", selected);
    }

    private Long parseSrtTime(String value) {
        Matcher matcher = SRT_TIME.matcher(value);
        if (!matcher.matches()) {
            return null;
        }
        try {
            return Long.parseLong(matcher.group(1)) * 3_600_000L
                    + Long.parseLong(matcher.group(2)) * 60_000L
                    + Long.parseLong(matcher.group(3)) * 1_000L
                    + Long.parseLong(matcher.group(4));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BusinessException invalidEntity() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }

    private BusinessException invalidRange() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_CONTENT_RANGE, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
