package com.anynote.core.enums;

/**
 * 角色标识
 *
 * @author 称霸幼儿园
 */
public enum Role {

    ADMIN_X("ADMIN_X"),
    STUDENT("STUDENT"),
    TEACHER("TEACHER"),
    MEMBER("MEMBER");


    private final String value;

    Role(String value) {
        this.value = value;
    }

    public String getValue() {
        return this.value;
    }
}
