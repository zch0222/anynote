package com.anynote.common.security.utils;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * 权限工具类
 *
 * @author 称霸幼儿园
 */
public class SecurityUtils {

    /**
     * 生成 BCryptPasswordEncoder 密码
     * @param password
     * @return
     */
    public static String encryptPassword(String password) {
        BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
        return passwordEncoder.encode(password);
    }

    /**
     * 判断密码是否相同
     * @param rawPassword 真实密码
     * @param encodedPassword 加密后字符串
     * @return 结果
     */
    public static boolean matchesPassword(String rawPassword, String encodedPassword) {
        BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
        return passwordEncoder.matches(rawPassword, encodedPassword);
    }
}
