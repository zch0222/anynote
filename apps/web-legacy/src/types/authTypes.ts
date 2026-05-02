export interface LoginRequest {
    username: string
    password: string
}

export interface UserInfo {
    username: string;
    nickname: string;
    role: string;
    avatar: string;
    token: {
        accessToken: string;
        refreshToken: string;
        accessTokenExpirationTime: number | null;
    } | null;
}