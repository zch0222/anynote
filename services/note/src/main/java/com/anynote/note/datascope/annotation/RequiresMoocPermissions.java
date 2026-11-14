package com.anynote.note.datascope.annotation;

import com.anynote.note.enums.NotePermissions;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 慕课权限校验注解。
 *
 * @author 称霸幼儿园
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresMoocPermissions {

    /**
     * 所需最低权限。
     *
     * @return 权限值
     */
    NotePermissions value();

    /**
     * 慕课 id 属性名。
     *
     * @return 属性名
     */
    String paramIdName() default "moocId";

    /**
     * 查询参数名。
     *
     * @return 参数名
     */
    String queryParamName();
}
