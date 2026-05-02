package com.anynote.core.constant;

/**
 * 权限相关的常量
 *
 * @author 称霸幼儿园
 */
public class SecurityConstants {

    public static final String CONTENT_TYPE = "Content-Type";

    public static final String METHOD = "method";

    public static final String URI = "uri";

    public static final String IP_ADDRESS = "ip_address";

    /**
     * 请求来源
     */
    public static final String FROM_SOURCE = "from-source";

    public static final String ADMIN_X = "ADMIN_X";

    /**
     * 内部请求
     */
    public static final String INNER = "inner";

    /** 内部调用 HMAC-SHA256 签名头 */
    public static final String INTERNAL_SIGN = "X-Internal-Sign";

    /** 内部调用时间戳头（毫秒） */
    public static final String INTERNAL_TIMESTAMP = "X-Internal-Timestamp";

    /**
     * 内部调用共享密钥（生产环境应从 Nacos 配置中心注入覆盖）
     */
    public static final String INTERNAL_SECRET = "anynote-internal-secret-change-in-prod";

    public static final String ACCESS_TOKEN = "accessToken";

    /**
     * 用户ID字段
     */
    public static final String DETAILS_USER_ID = "user_id";

    /**
     * 用户名字段
     */
    public static final String DETAILS_USERNAME = "username";

    /**
     * 授权信息字段
     */
    public static final String AUTHORIZATION_HEADER = "authorization";

    /**
     * 用户标识
     */
    public static final String USER_KEY = "user_key";

    /**
     * 登录用户
     */
    public static final String LOGIN_USER = "login_user";

    /**
     * 角色权限
     */
    public static final String ROLE_PERMISSION = "role_permission";
}
