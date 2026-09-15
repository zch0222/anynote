package com.anynote.system.service.impl;

import com.anynote.common.security.token.TokenUtil;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import com.anynote.system.mapper.SysUserMapper;
import com.anynote.system.model.dto.UpdateMyProfileDTO;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link SysUserServiceImpl#updateMyProfile} 的纯单测（方案 §4 B-3）。
 *
 * <p>这条端点替换掉原来 {@code @InnerAuth} 的 {@code PUT /user/{userId}}：身份必须从登录态取，
 * 只写四个白名单字段，null / 空串都落成空串。断言直接盯住传给 Mapper 的
 * {@link com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper}
 * ——它的 set 子句与 where 子句就是这条端点的全部语义。</p>
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SysUserServiceImplUpdateMyProfileTest {

    private static final long MY_USER_ID = 325L;
    private static final long OTHER_USER_ID = 326L;

    @Mock
    private SysUserMapper sysUserMapper;

    @Mock
    private TokenUtil tokenUtil;

    private SysUserServiceImpl sysUserService;

    /**
     * {@link LambdaUpdateWrapper} 的列名要靠 MyBatis Plus 的 TableInfo 缓存把
     * {@code SysUser::getNickname} 这类方法引用解析成列名。纯单测里没有 MyBatis 启动流程，
     * 因此在这里手动注册一次实体元数据，否则 set 子句会抛
     * 「can not find lambda cache for this entity」。
     */
    @BeforeAll
    static void initTableInfo() {
        if (TableInfoHelper.getTableInfo(SysUser.class) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysUser.class);
        }
    }

    @BeforeEach
    void setUp() {
        sysUserService = new SysUserServiceImpl();
        ReflectionTestUtils.setField(sysUserService, "baseMapper", sysUserMapper);
        ReflectionTestUtils.setField(sysUserService, "tokenUtil", tokenUtil);
        loginAs(MY_USER_ID);
        when(sysUserMapper.update(isNull(), any(LambdaUpdateWrapper.class))).thenReturn(1);
        // getMyUserInfo -> getSysUserInfoById 走的是自定义 selectSysUser
        when(sysUserMapper.selectSysUser(any())).thenReturn(Collections.singletonList(currentUser()));
    }

    private void loginAs(long userId) {
        SysUser sysUser = new SysUser();
        sysUser.setId(userId);
        sysUser.setUsername("member");
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(userId);
        loginUser.setSysUser(sysUser);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
    }

    private SysUser currentUser() {
        SysUser sysUser = new SysUser();
        sysUser.setId(MY_USER_ID);
        sysUser.setUsername("member");
        sysUser.setNickname("新昵称");
        sysUser.setSex(1);
        sysUser.setEmail("");
        sysUser.setPhoneNumber("");
        return sysUser;
    }

    private UpdateMyProfileDTO dto(String nickname, Integer sex, String email, String phoneNumber) {
        UpdateMyProfileDTO dto = new UpdateMyProfileDTO();
        dto.setNickname(nickname);
        dto.setSex(sex);
        dto.setEmail(email);
        dto.setPhoneNumber(phoneNumber);
        return dto;
    }

    /** 捕获传给 Mapper 的 UpdateWrapper：set 子句 + where 子句 + 占位参数就是全部语义 */
    private LambdaUpdateWrapper<SysUser> capturedWrapper(UpdateMyProfileDTO dto) {
        sysUserService.updateMyProfile(dto);
        ArgumentCaptor<LambdaUpdateWrapper<SysUser>> captor =
                ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(sysUserMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SysUser> wrapper = captor.getValue();
        // where 子句是惰性生成的：占位参数要等 getSqlSegment() 被调用后才入 paramNameValuePairs，
        // 这里先物化一次，后面的断言才看得到完整语义（set 子句在 .set() 时已入）。
        wrapper.getSqlSegment();
        return wrapper;
    }

    @Test
    @DisplayName("只更新当前登录用户：where 锚在登录态 userId 上，请求里没有 userId 可用")
    void onlyUpdatesCurrentUser() {
        LambdaUpdateWrapper<SysUser> wrapper = capturedWrapper(dto("新昵称", 1, "a@b.com", "13800000000"));

        assertTrue(wrapper.getSqlSegment().contains("id"),
                "where 子句必须按 id 过滤，实际：" + wrapper.getSqlSegment());
        assertTrue(wrapper.getParamNameValuePairs().containsValue(MY_USER_ID),
                "where 的 id 必须是当前登录用户的 id");
        assertFalse(wrapper.getParamNameValuePairs().containsValue(OTHER_USER_ID),
                "不能出现其他用户的 id");
    }

    @Test
    @DisplayName("null 与空串都写成 ''")
    void clearsEmailAndPhoneWithNullAndEmpty() {
        LambdaUpdateWrapper<SysUser> wrapper = capturedWrapper(dto("新昵称", 2, null, ""));

        // 六个 set：nickname / sex / email / phone_number / update_by / update_time
        assertEquals(7, wrapper.getParamNameValuePairs().size(),
                "6 个 set 占位符 + 1 个 where 占位符");
        long emptyStringCount = wrapper.getParamNameValuePairs().values().stream()
                .filter(""::equals)
                .count();
        assertEquals(2, emptyStringCount,
                "null 邮箱与空串手机号都要落成空串，实际参数：" + wrapper.getParamNameValuePairs());
        assertNull(wrapper.getParamNameValuePairs().values().stream()
                .filter(java.util.Objects::isNull).findAny().orElse(null),
                "四个白名单字段都不应写 null 进 SQL");
    }

    @Test
    @DisplayName("sex = 2（未设置）原样写入，不被当成「没传」忽略")
    void writesSexTwoAsIs() {
        LambdaUpdateWrapper<SysUser> wrapper = capturedWrapper(dto("新昵称", 2, null, null));

        assertTrue(wrapper.getParamNameValuePairs().containsValue(2),
                "sex = 2 必须原样出现在 set 参数里");
    }

    @Test
    @DisplayName("set 子句覆盖四个白名单字段与 update_by / update_time")
    void setsWhitelistedColumnsOnly() {
        LambdaUpdateWrapper<SysUser> wrapper = capturedWrapper(dto("新昵称", 0, "a@b.com", "13800000000"));
        String sqlSet = wrapper.getSqlSet();

        assertTrue(sqlSet.contains("nickname"), sqlSet);
        assertTrue(sqlSet.contains("sex"), sqlSet);
        assertTrue(sqlSet.contains("email"), sqlSet);
        assertTrue(sqlSet.contains("phone_number"), sqlSet);
        assertTrue(sqlSet.contains("update_by"), sqlSet);
        assertTrue(sqlSet.contains("update_time"), sqlSet);
        assertFalse(sqlSet.contains("password"), "密码绝不能被这条端点改写：" + sqlSet);
        assertFalse(sqlSet.contains("username"), "用户名不可修改：" + sqlSet);
        assertFalse(sqlSet.contains("status"), "账号状态不可由本人改写：" + sqlSet);
    }

    @Test
    @DisplayName("返回 getMyUserInfo() 的结果")
    void returnsRefreshedProfile() {
        SysUser result = sysUserService.updateMyProfile(dto("新昵称", 1, "a@b.com", "13800000000"));

        assertEquals(MY_USER_ID, result.getId());
        assertEquals("member", result.getUsername());
        assertEquals("", result.getPassword(), "返回体不含密码");
    }

    @Test
    @DisplayName("四个字段都是合法值时不抛异常")
    void acceptsValidPayload() {
        assertDoesNotThrow(() -> sysUserService.updateMyProfile(
                dto("新昵称", 2, "a@b.com", "13800000000")));
    }
}
