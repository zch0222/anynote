package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.model.po.Doc;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.api.model.po.NoteTask;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.mapper.DocMapper;
import com.anynote.note.mapper.MoocItemMapper;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTaskMapper;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeOutlineDTO;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.vo.KnowledgeOutlineVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.note.service.KnowledgeOutlineService;
import com.anynote.note.utils.KnowledgeMarkdownUtil;
import com.anynote.system.api.model.bo.LoginUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 知识目录与 Markdown 大纲实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeOutlineServiceImpl implements KnowledgeOutlineService {

    private final NoteMapper noteMapper;
    private final DocMapper docMapper;
    private final MoocMapper moocMapper;
    private final MoocItemMapper moocItemMapper;
    private final NoteTaskMapper noteTaskMapper;
    private final KnowledgeEntityService knowledgeEntityService;
    private final KnowledgeAccessService knowledgeAccessService;

    /**
     * 构造目录服务。
     */
    public KnowledgeOutlineServiceImpl(NoteMapper noteMapper, DocMapper docMapper, MoocMapper moocMapper,
                                       MoocItemMapper moocItemMapper, NoteTaskMapper noteTaskMapper,
                                       KnowledgeEntityService knowledgeEntityService,
                                       KnowledgeAccessService knowledgeAccessService) {
        this.noteMapper = noteMapper;
        this.docMapper = docMapper;
        this.moocMapper = moocMapper;
        this.moocItemMapper = moocItemMapper;
        this.noteTaskMapper = noteTaskMapper;
        this.knowledgeEntityService = knowledgeEntityService;
        this.knowledgeAccessService = knowledgeAccessService;
    }

    @Override
    public KnowledgeOutlineVO outline(LoginUser loginUser, KnowledgeOutlineDTO request) {
        if (request == null) {
            throw invalidEntity();
        }
        KnowledgeRef root = KnowledgeRef.parse(request.getRef(), null);
        int pageNum = request.getPageNum() == null ? 1 : request.getPageNum();
        int pageSize = request.getPageSize() == null ? 50 : request.getPageSize();
        if (pageNum < 1 || pageSize < 1) {
            throw invalidEntity();
        }
        if (pageSize > 100) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        List<KnowledgeOutlineVO.Node> nodes = switch (root.getType()) {
            case KNOWLEDGE_BASE -> knowledgeBaseNodes(loginUser, root);
            case MOOC -> moocNodes(loginUser, root, request.getParentId());
            case NOTE, MOOC_ITEM -> markdownNodes(loginUser, root);
            default -> throw invalidEntity();
        };
        if (root.getType() == KnowledgeEntityType.KNOWLEDGE_BASE || root.getType() == KnowledgeEntityType.MOOC) {
            nodes.sort(Comparator.comparing(KnowledgeOutlineVO.Node::getUpdateTime,
                            Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(KnowledgeOutlineVO.Node::getRef)
                    .thenComparing(KnowledgeOutlineVO.Node::getTitle, Comparator.nullsLast(Comparator.naturalOrder())));
        }
        int from = Math.min((pageNum - 1) * pageSize, nodes.size());
        int to = Math.min(from + pageSize, nodes.size());
        return KnowledgeOutlineVO.builder()
                .ref(root.ref())
                .nodes(new ArrayList<>(nodes.subList(from, to)))
                .pageNum(pageNum)
                .pageSize(pageSize)
                .total((long) nodes.size())
                .hasMore(to < nodes.size())
                .build();
    }

    private List<KnowledgeOutlineVO.Node> knowledgeBaseNodes(LoginUser loginUser, KnowledgeRef root) {
        requireReadable(loginUser, root);
        List<KnowledgeOutlineVO.Node> nodes = new ArrayList<>();
        noteMapper.selectList(new LambdaQueryWrapper<Note>()
                        .eq(Note::getKnowledgeBaseId, root.getId()).eq(Note::getStatus, 0))
                .forEach(note -> addIfReadable(loginUser, KnowledgeRef.of(KnowledgeEntityType.NOTE, note.getId()),
                        root.ref(), nodes));
        docMapper.selectList(new LambdaQueryWrapper<Doc>().eq(Doc::getKnowledgeBaseId, root.getId()))
                .forEach(doc -> addIfReadable(loginUser, KnowledgeRef.of(KnowledgeEntityType.DOC, doc.getId()),
                        root.ref(), nodes));
        moocMapper.selectList(new LambdaQueryWrapper<MoocPO>().eq(MoocPO::getKnowledgeBaseId, root.getId()))
                .forEach(mooc -> addIfReadable(loginUser, KnowledgeRef.of(KnowledgeEntityType.MOOC, mooc.getId()),
                        root.ref(), nodes));
        noteTaskMapper.selectList(new LambdaQueryWrapper<NoteTask>().eq(NoteTask::getKnowledgeBaseId, root.getId()))
                .forEach(task -> addIfReadable(loginUser, KnowledgeRef.of(KnowledgeEntityType.TASK, task.getId()),
                        root.ref(), nodes));
        return nodes;
    }

    private List<KnowledgeOutlineVO.Node> moocNodes(LoginUser loginUser, KnowledgeRef root, Long parentId) {
        requireReadable(loginUser, root);
        long actualParentId = parentId == null ? 0L : parentId;
        if (actualParentId < 0) {
            throw invalidEntity();
        }
        List<KnowledgeOutlineVO.Node> nodes = new ArrayList<>();
        moocItemMapper.selectList(new LambdaQueryWrapper<MoocItemPO>()
                        .eq(MoocItemPO::getMoocId, root.getId())
                        .eq(MoocItemPO::getParentId, actualParentId))
                .forEach(item -> addIfReadable(loginUser,
                        KnowledgeRef.of(KnowledgeEntityType.MOOC_ITEM, item.getId()), root.ref(), nodes));
        return nodes;
    }

    private List<KnowledgeOutlineVO.Node> markdownNodes(LoginUser loginUser, KnowledgeRef root) {
        requireReadable(loginUser, root);
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(root, true);
        if (document == null || !"markdown".equals(document.getFormat())) {
            throw invalidEntity();
        }
        List<KnowledgeOutlineVO.Node> nodes = new ArrayList<>();
        for (KnowledgeMarkdownUtil.Heading heading : KnowledgeMarkdownUtil.headings(document.getBody())) {
            nodes.add(KnowledgeOutlineVO.Node.builder()
                    .ref(root.ref())
                    .entityType("heading")
                    .title(heading.title())
                    .parentRef(root.ref())
                    .locator(Map.of("startLine", heading.startLine(), "endLine", heading.endLine()))
                    .updateTime(document.getSourceUpdatedAt())
                    .build());
        }
        return nodes;
    }

    private void addIfReadable(LoginUser loginUser, KnowledgeRef ref, String parentRef,
                               List<KnowledgeOutlineVO.Node> nodes) {
        if (!knowledgeAccessService.isReadable(loginUser, ref)) {
            return;
        }
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(ref, false);
        if (document == null) {
            return;
        }
        nodes.add(KnowledgeOutlineVO.Node.builder()
                .ref(document.getRef())
                .entityType(document.getEntityType())
                .title(document.getTitle())
                .parentRef(parentRef)
                .updateTime(document.getSourceUpdatedAt())
                .build());
    }

    private void requireReadable(LoginUser loginUser, KnowledgeRef ref) {
        if (!knowledgeAccessService.isReadable(loginUser, ref)) {
            throw new BusinessException(KnowledgeErrorConstants.NOT_READABLE, ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
    }

    private BusinessException invalidEntity() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
