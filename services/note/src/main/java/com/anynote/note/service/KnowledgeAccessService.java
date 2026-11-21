package com.anynote.note.service;

import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.model.bo.KnowledgeRef;
import com.anynote.note.model.dto.KnowledgeAuthorizeDTO;
import com.anynote.note.model.dto.KnowledgeScopeDTO;
import com.anynote.note.model.vo.KnowledgeAuthorizationVO;
import com.anynote.note.model.vo.KnowledgeScopeVO;
import com.anynote.system.api.model.bo.LoginUser;

/**
 * 指定用户的知识权限与检索范围服务。
 *
 * @author 称霸幼儿园
 */
public interface KnowledgeAccessService {

    /**
     * 计算五位权限串对应的详情权限。
     *
     * @param loginUser 用户身份，资料匿名访问时为 null
     * @param type 笔记、资料或慕课类型
     * @param createBy 创建者 id
     * @param permissions 五位权限串
     * @param knowledgeBasePermission 知识库成员权限
     * @return 0、4、6 或 7
     */
    int computeContentPermission(LoginUser loginUser, KnowledgeEntityType type, Long createBy,
                                 String permissions, Integer knowledgeBasePermission);

    /**
     * 获取指定用户对实体的详情权限。
     *
     * @param loginUser 用户身份
     * @param ref 实体引用
     * @return 详情权限值
     */
    int getPermission(LoginUser loginUser, KnowledgeRef ref);

    /**
     * 判断指定用户是否可在检索中读取实体。
     *
     * @param loginUser 用户身份
     * @param ref 实体引用
     * @return 是否可读
     */
    boolean isReadable(LoginUser loginUser, KnowledgeRef ref);

    /**
     * 判断实体是否在指定用户的列表可见范围内。
     *
     * @param loginUser 用户身份
     * @param ref 实体引用
     * @return 是否列表可见
     */
    boolean isListVisible(LoginUser loginUser, KnowledgeRef ref);

    /**
     * 获取可读性及当前版本。
     *
     * @param loginUser 用户身份
     * @param request 批量判定请求
     * @return 与输入同序的判定结果
     */
    KnowledgeAuthorizationVO authorize(LoginUser loginUser, KnowledgeAuthorizeDTO request);

    /**
     * 按复合实体键批量确认可读性，返回可读键集合；格式错误或实体不存在的键判为不可读。
     *
     * @param loginUser 用户身份
     * @param refs 复合实体键列表（note:12 或 mooc_item:5#transcript），每批最多 100 条
     * @return 可读实体键列表
     */
    java.util.List<String> authorizeCombined(LoginUser loginUser, java.util.List<String> refs);

    /**
     * 获取用户的默认或显式检索范围。
     *
     * @param loginUser 用户身份
     * @param request 范围请求
     * @return 检索范围
     */
    KnowledgeScopeVO scope(LoginUser loginUser, KnowledgeScopeDTO request);
}
