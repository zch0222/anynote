package com.anynote.note.service;

import com.anynote.common.elasticsearch.model.EsNoteIndex;
import com.anynote.common.elasticsearch.model.bo.SearchPageBean;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.file.api.model.bo.HuaweiOBSTemporarySignature;
import com.anynote.file.api.model.vo.OssSliceUploadTaskVO;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.model.bo.*;
import com.anynote.note.model.dto.NoteSearchDTO;
import com.anynote.note.model.vo.CollabGrantVO;
import com.anynote.note.model.vo.NoteListVO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * 笔记服务
 * @author 称霸幼儿园
 */
public interface NoteService extends IService<Note> {


    /**
     * 获取最近更新的笔记
     * @param queryParam
     * @return
     */
    public PageBean<NoteListVO> getNoteList(NoteQueryParam queryParam);

    public PageBean<Note> getNotesByKnowledgeBaseId(NoteQueryParam queryParam);

    public Note getNoteById(NoteQueryParam queryParam);

    /**
     * 编辑笔记
     * @param updateParam 更新参数；携带 version 时做乐观并发检测，版本过期抛 A0409
     * @return 保存后的服务端权威状态（标题 / 正文 / 更新时间 / 新版本号）
     */
    public NoteSaveResultVO editNote(NoteUpdateParam updateParam);

    public Integer getNoteDataScope(Long noteId);

    public String deleteNote(NoteDeleteParam param);

    /**
     * 创建笔记
     * @return 新笔记的id
     */
    public Long createNote(NoteCreateParam param);

    public NotePermissions getNotePermissions(Long noteId);

    /**
     * 推导当前登录用户对某笔记的协同准入。
     *
     * <p>复用 {@link #getNotePermissions(Long)} 的权限推导，再附上当前版本令牌与标题，
     * 供 BFF 决定是否签发协同令牌、令牌里的房间与只读标志怎么填。无权限时
     * {@code perm} 回 {@code NONE} 而不抛异常，且**不回标题与版本令牌**——
     * 该端点对任何登录用户开放，回了等于开放全站笔记标题与更新时间的枚举。</p>
     *
     * @param noteId 笔记id
     * @return 协同准入结果；笔记不存在抛 {@code A0404}
     */
    public CollabGrantVO getCollabGrant(Long noteId);

    public MarkdownImage uploadNoteImage(NoteImageUploadParam uploadParam);

    /**
     * 创建笔记图片上传任务（浏览器分片直传第 1 步）。
     * <p>
     * path 与 source 由服务端按笔记归属决定，请求体只带 fileName / hash / fileSize / contentType；
     * 返回的 uploadId 即后续换签名、标记、合并的凭据。
     * @param param 创建参数
     * @return 上传任务信息
     */
    public OssSliceUploadTaskVO createNoteImageUploadTask(NoteImageUploadTaskCreateParam param);

    /**
     * 创建笔记上传临时地址
     * @param createParam 创建参数
     * @return 华为OBS临时签名
     */
    public HuaweiOBSTemporarySignature getImageUploadTempSignature(NoteImageUploadSignatureCreateParam createParam);

    public String completeNoteImageUpload(NoteImageCompleteParam noteImageCompleteParam);

    public Integer submitNote(Long noteId);

    public SearchPageBean<EsNoteIndex> searchNote(NoteSearchDTO noteSearchDTO);


    public Note selectNoteById(NoteQueryParam queryParam);


}
