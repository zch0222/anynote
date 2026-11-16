package com.anynote.note.service.impl;

import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.web.enums.ResCode;
import com.anynote.note.api.enums.KnowledgeBasePermissions;
import com.anynote.note.api.model.po.UserKnowledgeBase;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.constant.KnowledgeErrorConstants;
import com.anynote.note.enums.DocPermissions;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeAuthorizeDTO;
import com.anynote.note.model.dto.KnowledgeScopeDTO;
import com.anynote.note.model.po.KnowledgeChangePO;
import com.anynote.note.model.vo.KnowledgeAuthorizationItemVO;
import com.anynote.note.model.vo.KnowledgeAuthorizationVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.note.model.vo.KnowledgeSourceDocumentVO;
import com.anynote.note.mapper.UserKnowledgeBaseMapper;
import com.anynote.note.mapper.UserNoteTaskMapper;
import com.anynote.note.service.KnowledgeAccessService;
import com.anynote.note.service.KnowledgeEntityService;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 指定用户的知识权限判定实现。
 *
 * @author 称霸幼儿园
 */
@Service
public class KnowledgeAccessServiceImpl implements KnowledgeAccessService {

    private final KnowledgeEntityService knowledgeEntityService;
    private final UserKnowledgeBaseMapper userKnowledgeBaseMapper;
    private final UserNoteTaskMapper userNoteTaskMapper;

    /**
     * 构造知识权限服务。
     *
     * @param knowledgeEntityService 权威实体读取服务
     * @param userKnowledgeBaseMapper 知识库成员 Mapper
     * @param userNoteTaskMapper 任务成员 Mapper
     */
    public KnowledgeAccessServiceImpl(KnowledgeEntityService knowledgeEntityService,
                                      UserKnowledgeBaseMapper userKnowledgeBaseMapper,
                                      UserNoteTaskMapper userNoteTaskMapper) {
        this.knowledgeEntityService = knowledgeEntityService;
        this.userKnowledgeBaseMapper = userKnowledgeBaseMapper;
        this.userNoteTaskMapper = userNoteTaskMapper;
    }

    @Override
    public int computeContentPermission(LoginUser loginUser, KnowledgeEntityType type, Long createBy,
                                        String permissions, Integer knowledgeBasePermission) {
        return switch (type) {
            case NOTE -> notePermission(loginUser, createBy, permissions, knowledgeBasePermission);
            case DOC -> docPermission(loginUser, createBy, permissions, knowledgeBasePermission);
            case MOOC, MOOC_ITEM, TRANSCRIPT, SUMMARY ->
                    moocPermission(loginUser, createBy, permissions, knowledgeBasePermission);
            default -> throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY,
                    ResCode.USER_REQUEST_PARAM_ERROR);
        };
    }

    @Override
    public int getPermission(LoginUser loginUser, KnowledgeRef ref) {
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(ref, false);
        if (document == null) {
            throw new BusinessException("实体不存在");
        }
        return permission(loginUser, ref, document);
    }

    @Override
    public boolean isReadable(LoginUser loginUser, KnowledgeRef ref) {
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(ref, false);
        return isReadableDocument(loginUser, ref, document);
    }

    @Override
    public boolean isListVisible(LoginUser loginUser, KnowledgeRef ref) {
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(ref, false);
        if (loginUser == null || document == null) {
            return false;
        }
        if (ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE || ref.getType() == KnowledgeEntityType.TASK) {
            return permission(loginUser, ref, document) >= NotePermissions.READ.getValue();
        }
        return contentListVisible(loginUser, ref, document);
    }

    @Override
    public KnowledgeAuthorizationVO authorize(LoginUser loginUser, KnowledgeAuthorizeDTO request) {
        if (request == null || request.getItems() == null || request.getItems().isEmpty()) {
            throw new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (request.getItems().size() > 100) {
            throw new BusinessException(KnowledgeErrorConstants.TOO_MANY, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        List<KnowledgeAuthorizationItemVO> results = new ArrayList<>(request.getItems().size());
        for (KnowledgeAuthorizeDTO.Item item : request.getItems()) {
            KnowledgeRef ref = KnowledgeRef.parse(item == null ? null : item.getRef(),
                    item == null ? null : item.getSubtype());
            KnowledgeSourceDocumentVO metadata = knowledgeEntityService.get(ref, false);
            if (!isReadableDocument(loginUser, ref, metadata)) {
                results.add(KnowledgeAuthorizationItemVO.builder()
                        .ref(ref.ref())
                        .subtype(ref.subtype())
                        .readable(false)
                        .build());
                continue;
            }
            KnowledgeSourceDocumentVO current = knowledgeEntityService.get(ref, true);
            if (current == null) {
                results.add(KnowledgeAuthorizationItemVO.builder()
                        .ref(ref.ref())
                        .subtype(ref.subtype())
                        .readable(false)
                        .build());
                continue;
            }
            results.add(KnowledgeAuthorizationItemVO.builder()
                    .ref(ref.ref())
                    .subtype(ref.subtype())
                    .readable(true)
                    .permissionBasis(permissionBasis(loginUser, current))
                    .kbId(current.getKbId())
                    .contentVersion(current.getContentVersion())
                    .metaVersion(current.getMetaVersion())
                    .moocId(current.getAttributes() != null
                            && current.getAttributes().get("moocId") instanceof Number moocId
                            ? moocId.longValue() : null)
                    .build());
        }
        return KnowledgeAuthorizationVO.builder().items(results).build();
    }

    @Override
    public KnowledgeScopeVO scope(LoginUser loginUser, KnowledgeScopeDTO request) {
        if (loginUser == null) {
            throw new AuthException(ResCode.UNAUTHORIZED_ERROR);
        }
        List<Long> requestedKbIds = request == null ? null : request.getKnowledgeBaseIds();
        List<String> refs = request == null ? null : request.getRefs();
        boolean defaultScope = (requestedKbIds == null || requestedKbIds.isEmpty())
                && (refs == null || refs.isEmpty());
        boolean admin = isAdmin(loginUser);
        Map<Long, Integer> memberships = memberships(loginUser);
        Map<Long, KnowledgeScopeVO.KnowledgeBase> scope = new LinkedHashMap<>();
        Set<Long> explicitKbIds = new LinkedHashSet<>();
        if (requestedKbIds != null) {
            for (Long kbId : requestedKbIds) {
                if (kbId == null || kbId <= 0) {
                    throw invalidEntity();
                }
                explicitKbIds.add(kbId);
            }
        }
        if (refs != null) {
            for (String value : refs) {
                KnowledgeSourceDocumentVO document = knowledgeEntityService.get(KnowledgeRef.parse(value, null), false);
                if (document != null && document.getKbId() != null && document.getKbId() > 0) {
                    explicitKbIds.add(document.getKbId());
                }
            }
        }
        if (defaultScope) {
            for (Map.Entry<Long, Integer> membership : memberships.entrySet()) {
                addScope(scope, membership.getKey(), membership.getValue(), false, false);
            }
        } else {
            for (Long kbId : explicitKbIds) {
                Integer membership = memberships.get(kbId);
                if (membership != null) {
                    addScope(scope, kbId, membership, true, false);
                } else if (admin) {
                    addScope(scope, kbId, KnowledgeBasePermissions.MANAGE.getValue(), true, true);
                }
            }
        }
        List<KnowledgeScopeVO.KnowledgeBase> knowledgeBases = scope.values().stream()
                .sorted(Comparator.comparing(KnowledgeScopeVO.KnowledgeBase::getKbId))
                .toList();
        return KnowledgeScopeVO.builder()
                .userId(userId(loginUser))
                .admin(admin)
                .defaultScope(defaultScope)
                .knowledgeBases(knowledgeBases)
                .build();
    }

    private boolean isReadableDocument(LoginUser loginUser, KnowledgeRef ref,
                                       KnowledgeSourceDocumentVO document) {
        if (loginUser == null || document == null) {
            return false;
        }
        int permission = permission(loginUser, ref, document);
        if (permission < NotePermissions.READ.getValue()) {
            return false;
        }
        if (ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE || ref.getType() == KnowledgeEntityType.TASK) {
            return true;
        }
        return contentListVisible(loginUser, ref, document);
    }

    private boolean contentListVisible(LoginUser loginUser, KnowledgeRef ref,
                                       KnowledgeSourceDocumentVO document) {
        if (isAdmin(loginUser)) {
            return true;
        }
        KnowledgeSourceDocumentVO.Acl acl = document.getAcl();
        Long userId = userId(loginUser);
        if (ref.getType() == KnowledgeEntityType.NOTE && document.getKbId() == 0) {
            return acl != null && Objects.equals(acl.getCreateBy(), userId);
        }
        if (acl != null && Objects.equals(acl.getCreateBy(), userId)) {
            return true;
        }
        Integer membership = membership(userId, document.getKbId());
        if (membership == null || membership > KnowledgeBasePermissions.READ.getValue()) {
            return false;
        }
        Integer dataScope = acl == null ? null : acl.getDataScope();
        if (Objects.equals(dataScope, 3)) {
            return true;
        }
        return membership == KnowledgeBasePermissions.MANAGE.getValue() && Objects.equals(dataScope, 2);
    }

    private int permission(LoginUser loginUser, KnowledgeRef ref, KnowledgeSourceDocumentVO document) {
        Long userId = loginUser == null ? null : userId(loginUser);
        if (ref.getType() == KnowledgeEntityType.KNOWLEDGE_BASE) {
            if (isAdmin(loginUser)) {
                return NotePermissions.MANAGE.getValue();
            }
            Integer membership = userId == null ? null : membership(userId, document.getKbId());
            if (membership == null || membership > KnowledgeBasePermissions.READ.getValue()) {
                return NotePermissions.NO.getValue();
            }
            return switch (membership) {
                case 1 -> NotePermissions.MANAGE.getValue();
                case 2 -> NotePermissions.EDIT.getValue();
                default -> NotePermissions.READ.getValue();
            };
        }
        if (ref.getType() == KnowledgeEntityType.TASK) {
            if (isAdmin(loginUser)) {
                return NotePermissions.MANAGE.getValue();
            }
            Integer membership = userId == null ? null : membership(userId, document.getKbId());
            if (membership == null || membership > KnowledgeBasePermissions.READ.getValue()) {
                return NotePermissions.NO.getValue();
            }
            UserNoteTask userTask = userNoteTaskMapper.selectOne(new LambdaQueryWrapper<UserNoteTask>()
                    .eq(UserNoteTask::getUserId, userId)
                    .eq(UserNoteTask::getNoteTaskId, ref.getId()));
            if (userTask == null || userTask.getPermissions() == null || userTask.getPermissions() == 3) {
                return NotePermissions.NO.getValue();
            }
            return userTask.getPermissions() == 1 ? NotePermissions.MANAGE.getValue() : NotePermissions.READ.getValue();
        }
        KnowledgeSourceDocumentVO.Acl acl = document.getAcl();
        if (acl == null) {
            return NotePermissions.NO.getValue();
        }
        Integer membership = userId == null ? null : membership(userId, document.getKbId());
        KnowledgeEntityType detailType = switch (ref.getType()) {
            case MOOC_ITEM, TRANSCRIPT, SUMMARY -> KnowledgeEntityType.MOOC;
            default -> ref.getType();
        };
        return computeContentPermission(loginUser, detailType, acl.getCreateBy(), acl.getPermissions(), membership);
    }

    private int notePermission(LoginUser loginUser, Long createBy, String permissions,
                               Integer knowledgeBasePermission) {
        if (isAdmin(loginUser)) {
            return NotePermissions.MANAGE.getValue();
        }
        Long userId = userId(loginUser);
        if (Objects.equals(createBy, userId)) {
            return notePermissionValue(permissions.substring(0, 1));
        }
        if (knowledgeBasePermission == null) {
            return notePermissionValue(permissions.substring(3, 4));
        }
        if (knowledgeBasePermission == KnowledgeBasePermissions.MANAGE.getValue()) {
            return notePermissionValue(permissions.substring(1, 2));
        }
        if (knowledgeBasePermission == KnowledgeBasePermissions.EDIT.getValue()) {
            return notePermissionValue(permissions.substring(2, 3));
        }
        if (knowledgeBasePermission == KnowledgeBasePermissions.READ.getValue()) {
            int member = notePermissionValue(permissions.substring(2, 3));
            return member > 0 ? NotePermissions.READ.getValue() : NotePermissions.NO.getValue();
        }
        return NotePermissions.NO.getValue();
    }

    private int docPermission(LoginUser loginUser, Long createBy, String permissions,
                              Integer knowledgeBasePermission) {
        if (loginUser == null) {
            return DocPermissions.parse(Integer.parseInt(permissions.substring(4, 5))).getValue();
        }
        if (isAdmin(loginUser)) {
            return DocPermissions.MANAGE.getValue();
        }
        int permission = 0;
        if (Objects.equals(createBy, userId(loginUser))) {
            permission = Integer.parseInt(permissions.substring(0, 1));
        }
        if (knowledgeBasePermission != null
                && knowledgeBasePermission == KnowledgeBasePermissions.MANAGE.getValue()) {
            permission = Math.max(permission, Integer.parseInt(permissions.substring(1, 2)));
        } else if (knowledgeBasePermission != null
                && knowledgeBasePermission != KnowledgeBasePermissions.NO.getValue()) {
            permission = Math.max(permission, Integer.parseInt(permissions.substring(2, 3)));
        }
        permission = Math.max(permission, Integer.parseInt(permissions.substring(3, 4)));
        return DocPermissions.parse(permission).getValue();
    }

    private int moocPermission(LoginUser loginUser, Long createBy, String permissions,
                               Integer knowledgeBasePermission) {
        if (loginUser == null) {
            return NotePermissions.NO.getValue();
        }
        int permission = 0;
        if (Objects.equals(createBy, userId(loginUser))) {
            permission = Math.max(permission, Integer.parseInt(permissions.substring(0, 1)));
        }
        int membership = Objects.requireNonNullElse(knowledgeBasePermission, KnowledgeBasePermissions.NO.getValue());
        if (membership == KnowledgeBasePermissions.MANAGE.getValue()) {
            permission = Math.max(permission, Integer.parseInt(permissions.substring(1, 2)));
        }
        if (membership < KnowledgeBasePermissions.READ.getValue()) {
            permission = Math.max(permission, Integer.parseInt(permissions.substring(2, 3)));
        }
        if (membership == KnowledgeBasePermissions.READ.getValue()) {
            permission = Math.max(permission,
                    Math.min(NotePermissions.READ.getValue(), Integer.parseInt(permissions.substring(2, 3))));
        }
        permission = Math.max(permission, Integer.parseInt(permissions.substring(3, 4)));
        permission = Math.max(permission, Integer.parseInt(permissions.substring(4, 5)));
        return permission;
    }

    private int notePermissionValue(String value) {
        int permission = Integer.parseInt(value);
        return switch (permission) {
            case 0 -> NotePermissions.NO.getValue();
            case 4 -> NotePermissions.READ.getValue();
            case 6 -> NotePermissions.EDIT.getValue();
            case 7 -> NotePermissions.MANAGE.getValue();
            default -> throw new BusinessException("笔记权限错误", ResCode.AUTH_ERROR);
        };
    }

    private String permissionBasis(LoginUser loginUser, KnowledgeSourceDocumentVO document) {
        if (isAdmin(loginUser)) {
            return "ADMIN";
        }
        Long userId = userId(loginUser);
        if (document.getAcl() != null && Objects.equals(document.getAcl().getCreateBy(), userId)) {
            return "AUTHOR";
        }
        Integer membership = membership(userId, document.getKbId());
        if (membership != null && membership == KnowledgeBasePermissions.MANAGE.getValue()) {
            return "KB_MANAGER";
        }
        if (membership != null && membership < KnowledgeBasePermissions.NO.getValue()) {
            return "MEMBER";
        }
        return "OTHER";
    }

    private Map<Long, Integer> memberships(LoginUser loginUser) {
        Map<Long, Integer> memberships = new LinkedHashMap<>();
        List<UserKnowledgeBase> rows = userKnowledgeBaseMapper.selectList(new LambdaQueryWrapper<UserKnowledgeBase>()
                .eq(UserKnowledgeBase::getUserId, userId(loginUser))
                .le(UserKnowledgeBase::getPermissions, KnowledgeBasePermissions.READ.getValue()));
        for (UserKnowledgeBase row : rows) {
            memberships.put(row.getKnowledgeBaseId(), row.getPermissions());
        }
        return memberships;
    }

    private Integer membership(Long userId, Long kbId) {
        if (userId == null || kbId == null || kbId <= 0) {
            return null;
        }
        UserKnowledgeBase row = userKnowledgeBaseMapper.selectOne(new LambdaQueryWrapper<UserKnowledgeBase>()
                .eq(UserKnowledgeBase::getUserId, userId)
                .eq(UserKnowledgeBase::getKnowledgeBaseId, kbId));
        return row == null ? null : row.getPermissions();
    }

    private void addScope(Map<Long, KnowledgeScopeVO.KnowledgeBase> scope, Long kbId, Integer permissions,
                          boolean explicit, boolean adminOverride) {
        KnowledgeSourceDocumentVO document = knowledgeEntityService.get(
                KnowledgeRef.of(KnowledgeEntityType.KNOWLEDGE_BASE, kbId), false);
        if (document == null) {
            return;
        }
        scope.put(kbId, KnowledgeScopeVO.KnowledgeBase.builder()
                .kbId(kbId)
                .name(document.getTitle())
                .role(role(permissions, adminOverride))
                .permissions(permissions)
                .explicit(explicit)
                .build());
    }

    private String role(Integer permissions, boolean adminOverride) {
        if (adminOverride) {
            return "ADMIN";
        }
        return switch (permissions) {
            case 1 -> "MANAGE";
            case 2 -> "EDIT";
            default -> "READ";
        };
    }

    private boolean isAdmin(LoginUser loginUser) {
        return loginUser != null && loginUser.getSysUser() != null
                && SysUser.isAdminX(loginUser.getSysUser().getRole());
    }

    private Long userId(LoginUser loginUser) {
        if (loginUser == null) {
            return null;
        }
        return loginUser.getUserId() != null ? loginUser.getUserId()
                : loginUser.getSysUser() == null ? null : loginUser.getSysUser().getId();
    }

    private BusinessException invalidEntity() {
        return new BusinessException(KnowledgeErrorConstants.INVALID_ENTITY, ResCode.USER_REQUEST_PARAM_ERROR);
    }
}
