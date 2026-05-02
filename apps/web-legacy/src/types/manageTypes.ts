

export interface SysUser {
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    id: number;
    username: string;
    nickname: string;
    email: string;
    phoneNumber: string;
    sex: number;
    avatar: string;
    password: string;
    status: number;
    deleted: number;
    loginIp: string;
    loginDate: any;
    role: any;
    organizations: any;
}

export interface Role {
    updateTime: any;
    id: number;
    roleName: string;
    roleKey: string;
    roleSort: number;
    dataScope: number;
    status: string;
    deleted: any;
}

export interface SysUserInfo {
    createBy: number;
    updateBy: number;
    updateTime: any;
    id: number;
    username: string;
    nickname: string;
    email: string;
    phoneNumber: string;
    sex: number;
    avatar: string;
    status: number;
    deleted: number;
    loginIp: string;
    loginDate: any;
    role: Role;
    organizations: Organization[];
}

export interface Organization {
    updateTime: any;
    id: number;
    parentId: number;
    ancestors: string;
    organizationName: string;
    orderNum: number;
    leader: any;
    phone: any;
    email: any;
    status: number;
    deleted: any;
}


