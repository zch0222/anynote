export interface ResData<T> {
    code: string
    msg: string | null
    data: T
}

export interface PageBean<T> {
    rows: T[]
    total: number
    pages: number
    current: number
}

export interface SearchVO<T, K> {
    highlight: T
    source: K
}

export interface BaseEntity {
    createBy?: number;
    createTime?: string;
    updateBy?: number;
    updateTime: string;
    remark?: string;
    params?: Map<string, any>;
}
