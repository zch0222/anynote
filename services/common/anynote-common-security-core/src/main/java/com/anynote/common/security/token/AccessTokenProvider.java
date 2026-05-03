package com.anynote.common.security.token;

/**
 * Provides the access token bound to the current execution context.
 */
public interface AccessTokenProvider {

    String getAccessToken();
}
