/**
 * ResDataPageBeanMoocListVO
 */
export interface Response {
    code?: string;
    data?: PageBeanMoocList;
    msg?: string;
    [property: string]: any;
}

/**
 * PageBeanMoocListVO
 */
export interface PageBeanMoocList {
    /**
     * 当前页码
     */
    current?: number;
    /**
     * 总页数
     */
    pages?: number;
    rows?: MoocInfo[];
    /**
     * 总条数
     */
    total?: number;
    [property: string]: any;
}

/**
 * 慕课VO
 *
 * MoocListVO
 */
export interface MoocInfo {
    /**
     * 创建者
     */
    createBy?: number;
    /**
     * 创建时间
     */
    createTime?: string;
    /**
     * 慕课创建者用户名
     */
    creatorUsername?: string;
    /**
     * 数据权限 1.自己可见 2.自己和管理员可见 3.知识库中所有人可见
     */
    dataScope?: number;
    /**
     * 慕课id
     */
    id?: number;
    /**
     * 所属知识库id 0表示不属于任何知识库
     */
    knowledgeBaseId?: number;
    /**
     * 慕课描述
     */
    moocDescription?: string;
    /**
     * 慕课权限
     */
    moocPermission?: number;
    /**
     * 请求参数
     */
    params?: MapObject;
    /**
     * 备注
     */
    remark?: string;
    /**
     * 慕课标题
     */
    title?: string;
    /**
     * 更新者
     */
    updateBy?: number;
    /**
     * 更新时间
     */
    updateTime?: string;
    /**
     * 用户慕课权限
     */
    userPermission?: number;
    [property: string]: any;
}

/**
 * 请求参数
 *
 * MapObject
 */
export interface MapObject {
    key?: { [key: string]: any };
    [property: string]: any;
}

export interface MoocItem {
    /**
     * 项目文本
     */
    itemText?: string;
    /**
     * 慕课类型对象 0.章节 1.视频 2.文档
     */
    moocItemType?: number;
    /**
     * 文件对象名称
     */
    objectName?: string;
    /**
     * 父Item id，如果为0表示没有父节点
     */
    parentId?: number;
    /**
     * 慕课Item标题
     */
    title?: string;
    [property: string]: any;
}
