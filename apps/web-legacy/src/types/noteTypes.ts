
export interface NoteKnowledgeBaseDTO {
    id: number;
    knowledgeBaseName: string;
    cover: string;
    type: number;
    status: number;
    organizationId?: number;
    organizationName?: string;
    permissions: number;
    detail: string;
}


export interface AdminNoteTask {
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    id: number;
    taskName: string;
    taskDescribe?: string
    startTime: string;
    endTime: string;
    knowledgeBaseId: number;
    status: number;
    submittedCount: number;
    needSubmitCount: number;
    submissionProgress: number;
}

export interface NoteTaskSubmissionInfo {
    id: number
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    noteTaskId: number;
    userId: number;
    noteId: number;
    submitTime: string;
    deleted: number;
    submissionUsername: string;
    submissionNickname: string;
    noteTitle: string;
}

export interface NoteTask {
    updateTime: string;
    id: number;
    taskName: string;
    taskDescribe?: string;
    startTime: string;
    endTime: string;
    knowledgeBaseId: number;
    status: number;
    submissionStatus: number;
    submissionNoteId: number | null;
    submitTime: string | null;
    taskCreatorUsername: string;
    taskCreatorNickname: string;
}


export interface NoteInfo {
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    latestOperationTime?: string;
    id: number;
    title: string;
    noteTextId: number;
    knowledgeBaseId: number;
    knowledgeBaseName?: string;
    status: number;
    dataScope: number;
    deleted: number;
    notePermissions: number;
    submitTaskName: string | null;
}

export interface Note {
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    id: number;
    title: string;
    noteTextId: number;
    knowledgeBaseId: number;
    status: number;
    dataScope: number;
    deleted: number;
    content: string;
    notePermissions: number;
    knowledgeBaseName: string;
    submitTaskName: string;
}

export interface KnowledgeBaseDTO {
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    remark: string;
    id: number;
    knowledgeBaseName: string;
    cover: string;
    type: number;
    status: number;
    permissions: any;
    detail: any;
}

export interface MarkdownImage {
    image: string
}

export interface CreateDTO {
    id: number
}

export interface NoteHistoryListItemVO {
    operationLogId: number;
    operationTime: string;
    updaterId: number;
    updaterNickname: string;
    updaterUsername: string;
}

export interface NoteEdit {
    editLogId: number;
    originalText: string;
    revisedText: string;
    changeType: number;
    originalPosition: number;
    revisedPosition: number;
    editTime: string;
    editorId: number;
    editorUsername: string;
    editorNickname: string;
}

export interface NoteHistory {
    noteHistoryId: number;
    noteId: number;
    title: string;
    content: string;
    historyTime: string;
    createBy: number;
    noteEditList: NoteEdit[]
}

export interface NoteSearchHighlight {
    title?: string[];
    content?: string[];
}

export interface NoteSearchSource {
    id: number;
    title: string;
    noteTextId: number;
    knowledgeBaseId: number;
    status: number;
    dataScope: number;
    permissions: number;
    deleted: number;
    createBy: number;
    createTime: string;
    updateBy: number;
    updateTime: string;
    knowledgeBaseName: string;
    submitTaskName: string | null;
}

export interface NoteOperationCount {
    userId: number;
    nickname: string;
    noteId: number;
    count: number;
}

export interface KnowledgeBaseMember {
    userId: number;
    username: string;
    nickname: string;
    permissions: number;
}

interface ImportFailUser {
    username: string;

    reason: string;
}

export interface KnowledgeBaseImportUserVO {
    /**
     * 名单链接
     */
    excelUrl: string;

    failUserList: ImportFailUser[];

    /**
     * 失败条数
     */
    failCount: number;
}

export interface ImportKnowledgeBaseUserVO {
    excelUrl: string;
    failUserList: ImportFailUser[];
    failCount: number;
}

export interface DocListVO {
    /** 知识库ID */
    id: number;

    /** 知识库名称 */
    docName: string;

    /** 创建者ID */
    createBy: number;

    indexStatus: number;

    creatorNickname: string;

    creatorUsername: string;

    knowledgeBaseId: number;

    /** 创建时间，根据实际使用情况选择类型 */
    createTime: string | Date;

    /** 更新时间，根据实际使用情况选择类型 */
    updateTime: string | Date;
}

export interface DocVO {
    /**
     * 知识库ID
     */
    id: number;

    /**
     * 知识库名称
     */
    docName: string;

    /**
     * 创建者ID
     */
    createBy: number;

    indexStatus: number;

    creatorNickname: string;

    creatorUsername: string;

    knowledgeBaseId: number;

    createTime: Date;

    updateTime: Date;

    url: string;

    hash: string;

    permission: number;
}





