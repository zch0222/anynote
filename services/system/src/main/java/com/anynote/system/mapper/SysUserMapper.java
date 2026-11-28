package com.anynote.system.mapper;

import com.anynote.system.api.model.po.SysUser;
import com.anynote.system.api.model.vo.KnowledgeBaseUserVO;
import com.anynote.system.api.model.vo.ManageUserVO;
import com.anynote.system.api.model.bo.SysUserQueryParam;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户 Mapper
 * @author 称霸幼儿园
 */
@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {

    /**
     * 根据用户名选取用户
     * @param username 用户名
     * @return 用户信息
     */
    public SysUser selectUserByUserName(@Param("username") String username);

    public Integer insertUserRole(@Param("userId") Long userId,
                                  @Param("roleId") Long roleId);

    /**
     * 删除用户全部角色关联
     * @param userId 用户id
     * @return 删除条数
     */
    public Integer deleteUserRolesByUserId(@Param("userId") Long userId);

    /**
     * 查询管理端用户列表
     * @param userId 用户id
     * @param username 用户名关键字
     * @return 用户列表
     */
    public List<ManageUserVO> selectManageUserList(@Param("userId") Long userId,
                                                   @Param("username") String username);

    public List<KnowledgeBaseUserVO> selectKnowledgeBaseUsers(@Param("knowledgeBaseId") Long knowledgeBaseId,
                                                              @Param("username") String username);

    public List<SysUser> selectSysUser(SysUserQueryParam queryParam);
}
