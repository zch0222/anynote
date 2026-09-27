package com.anynote.note.utils;

import com.anynote.core.utils.StringUtils;

import java.util.Date;

/**
 * 笔记乐观并发版本号工具
 *
 * <p>{@code n_note} 没有 version 列，直接把 {@code update_time} 的毫秒时间戳当版本令牌。
 * 该列是 MySQL {@code datetime}（秒级），同一秒内的连续保存版本号相同，
 * 冲突检测在这个极窄窗口会放行而不是误报——方向上宁可漏报也不打断正在编辑的用户。</p>
 *
 * @author 称霸幼儿园
 */
public final class NoteVersionUtil {

    private NoteVersionUtil() {
    }

    /**
     * 由更新时间派生版本号，时间为空时返回 null（表示该笔记暂无可比对的版本）
     */
    public static String toVersion(Date updateTime) {
        return StringUtils.isNull(updateTime) ? null : String.valueOf(updateTime.getTime());
    }

    /**
     * 下一次写入的更新时间：当前时间截断到整秒，且至少比当前版本晚 1 秒。
     *
     * <p>{@code update_time} 只有秒级精度，所有写入方都按这条规则取新时间，
     * 才能保证每次写入都得到一个新的版本号；否则同一秒内的两次写入版本号相同，
     * 持有旧版本号的一方会把另一方的写入当成自己写的。</p>
     *
     * @param currentUpdateTime 写入前的更新时间，为空表示没有可比较的版本
     * @param nowMillis         当前时间（毫秒）
     * @return 新的更新时间（毫秒，整秒）
     */
    public static long nextUpdateTime(Date currentUpdateTime, long nowMillis) {
        long now = nowMillis / 1000L * 1000L;
        if (StringUtils.isNull(currentUpdateTime)) {
            return now;
        }
        return Math.max(now, currentUpdateTime.getTime() / 1000L * 1000L + 1000L);
    }

    /**
     * 判断客户端提交的版本是否已过期
     *
     * @param clientVersion  客户端携带的版本，空白表示放弃冲突检测
     * @param currentVersion 服务端当前版本
     * @return true 表示客户端基于的是旧版本，应拒绝本次写入
     */
    public static boolean isStale(String clientVersion, String currentVersion) {
        if (StringUtils.isEmpty(clientVersion)) {
            return false;
        }
        return !clientVersion.equals(currentVersion);
    }
}
