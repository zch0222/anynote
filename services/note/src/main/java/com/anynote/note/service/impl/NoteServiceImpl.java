package com.anynote.note.service.impl;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.query_dsl.*;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import com.alibaba.fastjson2.JSON;
import com.anynote.common.elasticsearch.constant.ElasticsearchIndexConstants;
import com.anynote.common.elasticsearch.model.EsNoteIndex;
import com.anynote.common.elasticsearch.model.bo.SearchPageBean;
import com.anynote.common.elasticsearch.model.vo.SearchVO;
import com.anynote.common.elasticsearch.utils.ElasticsearchUtil;
import com.anynote.common.rocketmq.callback.RocketmqSendCallbackBuilder;
import com.anynote.common.rocketmq.properties.RocketMQProperties;
import com.anynote.common.rocketmq.tags.NoteTagsEnum;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.core.constant.Constants;
import com.anynote.core.constant.FileConstants;
import com.anynote.core.constant.HuaweiOBSConstants;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.exception.auth.AuthException;
import com.anynote.core.exception.user.UserParamException;
import com.anynote.core.utils.RemoteResDataUtil;
import com.anynote.core.utils.StringUtils;
import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.PageBean;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.file.api.RemoteFileService;
import com.anynote.file.api.enums.FileSources;
import com.anynote.file.api.model.dto.CompleteUploadDTO;
import com.anynote.file.api.model.dto.CreateHuaweiOBSTemporarySignatureDTO;
import com.anynote.file.api.model.dto.OssSliceUploadTaskCreateDTO;
import com.anynote.file.api.model.bo.HuaweiOBSTemporarySignature;
import com.anynote.file.api.model.po.FilePO;
import com.anynote.file.api.model.vo.OssSliceUploadTaskVO;
import com.anynote.note.api.model.bo.GenerateNoteEditLogMessage;
import com.anynote.note.api.model.po.*;
import com.anynote.note.datascope.annotation.RequiresKnowledgeBasePermissions;
import com.anynote.note.datascope.annotation.RequiresNotePermissions;
import com.anynote.note.datascope.aspect.RequiresNotePermissionsAspect;
import com.anynote.note.api.enums.KnowledgeBasePermissions;
import com.anynote.note.enums.NoteFileType;
import com.anynote.note.enums.NotePermissions;
import com.anynote.note.mapper.NoteMapper;
import com.anynote.note.mapper.NoteTextMapper;
import com.anynote.note.model.bo.*;
import com.anynote.note.model.dto.NoteSearchDTO;
import com.anynote.note.model.vo.NoteListVO;
import com.anynote.note.model.vo.NoteSaveResultVO;
import com.anynote.note.service.KnowledgeBaseService;
import com.anynote.note.service.NoteImageService;
import com.anynote.note.service.NoteService;
import com.anynote.note.utils.MarkdownUtil;
import com.anynote.note.utils.NoteVersionUtil;
import com.anynote.system.api.model.bo.LoginUser;
import com.anynote.system.api.model.po.SysUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.Resource;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * 笔记服务实现
 * @author 称霸幼儿园
 */
@Service
@Slf4j
public class NoteServiceImpl extends ServiceImpl<NoteMapper, Note>
        implements NoteService {


    @Autowired
    private TokenUtil tokenUtil;

    @Autowired
    private KnowledgeBaseService knowledgeBaseService;

    @Autowired
    private NoteImageService noteImageService;

    @Autowired
    private NoteTextMapper noteTextMapper;

    @Resource
    private RemoteFileService remoteFileService;

    @Autowired
    private RocketMQTemplate rocketMQTemplate;

    @Autowired
    private RocketMQProperties rocketMQProperties;

    @Autowired
    private ElasticsearchClient elasticsearchClient;


    @Override
    public PageBean<NoteListVO> getNoteList(NoteQueryParam queryParam) {
//
//        LambdaQueryWrapper
        LoginUser loginUser = tokenUtil.getLoginUser();
        queryParam.setOperatorId(loginUser.getUserId());

        PageHelper.startPage(queryParam.getPage(), queryParam.getPageSize(), "latest_operation_time DESC");
        List<NoteListVO> noteVOList = this.baseMapper.selectNoteList(queryParam);
        PageInfo<NoteListVO> pageInfo = new PageInfo<>(noteVOList);

        for (NoteListVO noteListVO : noteVOList) {
            noteListVO.setNotePermissions(this.getNotePermissions(noteListVO.getId()).getValue());
        }
        return PageBean.<NoteListVO>builder()
                .rows(noteVOList)
                .current(queryParam.getPage())
                .pages(pageInfo.getPages())
                .total(pageInfo.getTotal())
                .build();
    }

    @Override
    public PageBean<Note> getNotesByKnowledgeBaseId(NoteQueryParam queryParam) {

        List<Note> noteList = this.baseMapper.selectNoteInfoList(queryParam);
        noteList.stream().forEach(note -> {
            note.setNotePermissions(this.getNotePermissions(note.getId()).getValue());
        });
        PageInfo<Note> pageInfo = new PageInfo<>(noteList);
        PageBean<Note> pageBean = new PageBean<>();
        pageBean.setRows(noteList);
        pageBean.setTotal(pageInfo.getTotal());
        pageBean.setPages(pageInfo.getPages());
        return pageBean;
    }

    @Override
    @RequiresNotePermissions(NotePermissions.READ)
    public Note getNoteById(NoteQueryParam queryParam) {
        Note note = this.selectNoteById(queryParam);
        if (StringUtils.isNull(note)) {
            throw new UserParamException("访问笔记失败", ResCode.USER_REQUEST_PARAM_ERROR);
        }
        note.setNotePermissions(((NotePermissions) queryParam.getParams()
                .get(RequiresNotePermissionsAspect.NOTE_PERMISSIONS)).getValue());
        return note;
    }

    @Override
    public Note selectNoteById(NoteQueryParam queryParam) {
        return this.baseMapper.selectNoteById(queryParam);
    }

    @Transactional(rollbackFor = Exception.class)
    @RequiresKnowledgeBasePermissions(value = KnowledgeBasePermissions.EDIT,
            message = "没有权限创建笔记")
    @Override
    public Long createNote(NoteCreateParam createParam) {
        Date date = new Date();
        LoginUser loginUser = tokenUtil.getLoginUser();

        NoteText noteText = new NoteText();
        noteText.setContent("# " + createParam.getTitle());
        noteText.setCreateBy(loginUser.getSysUser().getId());
        noteText.setCreateTime(date);
        noteText.setUpdateBy(loginUser.getSysUser().getId());
        noteText.setUpdateTime(date);
        noteTextMapper.insert(noteText);

        Note note = Note.builder()
                .title(createParam.getTitle())
                .noteTextId(noteText.getId())
                .status(0)
                .dataScope(1)
                .permissions("70000")
                .deleted(0)
                .knowledgeBaseId(createParam.getKnowledgeBaseId())
                .build();
        note.setCreateBy(loginUser.getSysUser().getId());
        note.setCreateTime(date);
        note.setUpdateBy(loginUser.getSysUser().getId());
        note.setCreateTime(date);



        this.baseMapper.insert(note);
        String destination = rocketMQProperties.getNoteTopic() +  ":" + NoteTagsEnum.GENERATOR_NOTE_INDEX.name();
        rocketMQTemplate.asyncSend(destination, note.getId(), RocketmqSendCallbackBuilder.commonCallback());
        return note.getId();
    }

    /**
     * 提交笔记
     * 已经鉴权过无需再次鉴权
     * @param noteId
     */
    @Override
    public Integer submitNote(Long noteId) {
        Note note = Note.builder()
                .id(noteId)
                .permissions("44000")
                .build();
        return this.baseMapper.updateById(note);
    }

    /**
     * 删除笔记
     * @param param 笔记删除参数
     * @return 删除结果
     */
    @Transactional(rollbackFor = Exception.class)
    @RequiresNotePermissions(NotePermissions.MANAGE)
    @Override
    public String deleteNote(NoteDeleteParam param) {
        LambdaQueryWrapper<Note> noteLambdaQueryWrapper = new LambdaQueryWrapper<>();
        noteLambdaQueryWrapper
                .eq(Note::getId, param.getId())
                .select(Note::getNoteTextId);
        Note noteInfo = this.baseMapper.selectOne(noteLambdaQueryWrapper);
        this.baseMapper.deleteById(param.getId());
        noteTextMapper.deleteById(noteInfo.getNoteTextId());

        String destination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.DELETE_NOTE_INDEX.name();
        rocketMQTemplate.asyncSend(destination, param.getId(), RocketmqSendCallbackBuilder.commonCallback());
        return Constants.SUCCESS_RES;
    }

    /**
     * 搜索笔记
     * @param noteSearchDTO
     * @return
     */
    @Override
    public SearchPageBean<EsNoteIndex> searchNote(NoteSearchDTO noteSearchDTO) {
        LoginUser loginUser = tokenUtil.getLoginUser();
        SearchResponse<EsNoteIndex> searchResponse = null;
        List<Query> queries = new ArrayList<>();

        Query selfNote = TermQuery.of(t -> t
                .field("createBy")
                .value(loginUser.getSysUser().getId()))
                ._toQuery();
        System.out.println(selfNote.toString());
//
//        Query knowledgeBaseIdQuery = TermQuery.of(t -> t
//                .field("knowledgeBaseId")
//                .value(JSON.toJSONString(knowledgeBaseService.getUsersKnowledgeBaseIds(loginUser.getSysUser().getId()))))
//                ._toQuery();
//        System.out.println(knowledgeBaseIdQuery.toString());
//
//        Query dataScopeQuery = TermQuery.of(t -> t.field("dataScope").value())
//
//        Query knowledgeBaseNote =
//        BoolQuery knowledgeBaseNote = BoolQuery.of(b -> b
//                .must(ScriptQuery)))
//        Query boolQuery = BoolQuery.of(b -> b
//                .should(selfNote)
//                .should())
        queries.add(selfNote);
        Query keywordQuery = MatchQuery.of(q -> q
                .field("all")
                .query(noteSearchDTO.getKeyword()))
                ._toQuery();
        queries.add(keywordQuery);
        Query query = BoolQuery.of(b -> b.must(queries))._toQuery();
        log.info(query.toString());

        Integer from = (noteSearchDTO.getPage()-1) * noteSearchDTO.getPageSize();

        try {
            searchResponse = elasticsearchClient.search(s -> s
                    .index(ElasticsearchIndexConstants.NOTE_INDEX)
                    .query(query)
                    .from(from)
                    .size(noteSearchDTO.getPageSize())
                    .highlight(h -> h
                            .requireFieldMatch(false)
                            .fields("title", hBuilder -> hBuilder)
                            .fields("content", hBuilder -> hBuilder)
                            .fragmentSize(20))
                    .source(sourceConfigBuilder -> sourceConfigBuilder
                            .filter(sourceFilterBuilder -> sourceFilterBuilder
                                    .excludes("content"))),
//                    .query(q -> q
//                            .match(t -> t
//                                    .field("all")
//                                    .query(noteSearchDTO.getKeyword()))),
                    EsNoteIndex.class);
        } catch (IOException e) {
            e.printStackTrace();
            throw new BusinessException("搜索笔记失败，请联系管理员");
        }

        SearchPageBean<EsNoteIndex> esNoteIndexSearchPageBean = ElasticsearchUtil.buildSearchPageBean(searchResponse, EsNoteIndex.class,
                noteSearchDTO.getPageSize(), noteSearchDTO.getPage());
        for (SearchVO<EsNoteIndex> esNoteIndexSearchVO : esNoteIndexSearchPageBean.getRows()) {
            try {
                esNoteIndexSearchVO.getSource().setPermissions(this.getNotePermissions(esNoteIndexSearchVO.getSource().getId()).getValue());
            } catch (UserParamException e) {
                esNoteIndexSearchVO.getSource().setPermissions(0);
                log.error("搜索：笔记" + esNoteIndexSearchVO.getSource().getId() + "不存在");
            }
        }
        return esNoteIndexSearchPageBean;
    }

    @Transactional(rollbackFor = Exception.class)
    @RequiresNotePermissions(NotePermissions.EDIT)
    @Override
    public NoteSaveResultVO editNote(NoteUpdateParam updateParam) {
        LoginUser loginUser = tokenUtil.getLoginUser();
        // n_note.update_time 是秒级 datetime：先截断到整秒再写，返回的 version 才能和下次读回来的值精确相等，
        // 否则毫秒尾数会让紧接着的第二次保存被误判成冲突
        Date updateTime = new Date(System.currentTimeMillis() / 1000L * 1000L);
        updateParam.setUpdateTime(updateTime);
        Note oldNote = this.baseMapper.selectNoteById(NoteQueryParam.builder()
                .id(updateParam.getId())
                .build());
        if (StringUtils.isNull(oldNote)) {
            throw new UserParamException("笔记不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
        // 冲突检测放在任何写入之前：版本过期时不落库、不发索引与编辑日志消息
        if (NoteVersionUtil.isStale(updateParam.getVersion(), NoteVersionUtil.toVersion(oldNote.getUpdateTime()))) {
            throw new BusinessException("笔记已被其他会话更新，请刷新后重试", ResCode.RESOURCE_VERSION_CONFLICT);
        }
        // 移动到别的知识库：@RequiresNotePermissions 只校验了源笔记，目标知识库必须单独校验，
        // 否则可以把笔记塞进任何一个只知道 id 的知识库
        if (StringUtils.isNotNull(updateParam.getKnowledgeBaseId())
                && !updateParam.getKnowledgeBaseId().equals(oldNote.getKnowledgeBaseId())) {
            Integer targetPermissions = knowledgeBaseService.getUserKnowledgeBasePermissions(
                    loginUser.getSysUser().getId(), updateParam.getKnowledgeBaseId());
            if (StringUtils.isNull(targetPermissions)
                    || targetPermissions > KnowledgeBasePermissions.EDIT.getValue()) {
                throw new AuthException("没有权限移动笔记到目标知识库", ResCode.UNAUTHORIZED_ERROR);
            }
        } else {
            // 与当前归属相同时不下发 knowledge_base_id，避免无谓的列更新
            updateParam.setKnowledgeBaseId(null);
        }
        Integer count = this.baseMapper.updateNote(updateParam);
        if (count != 1) {
            throw new BusinessException("更新笔记失败", ResCode.USER_ERROR);
        }

//        LambdaQueryWrapper<Note> noteLambdaQueryWrapper = new LambdaQueryWrapper<>();
//        noteLambdaQueryWrapper
//                .eq(Note::getId, updateParam.getId())
//                .select(Note::getNoteTextId);
//        Note oldNote = this.baseMapper.selectOne(noteLambdaQueryWrapper);
        updateParam.setContentId(oldNote.getNoteTextId());
        Integer contentCount = this.baseMapper.updateContent(updateParam);
        if (contentCount != 1) {
            throw new BusinessException("更新笔记失败", ResCode.USER_ERROR);
        }
        Note currentNote = Note.builder()
                .id(updateParam.getId())
                .title(StringUtils.isNotNull(updateParam.getTitle()) ? updateParam.getTitle() : oldNote.getTitle())
                .noteTextId(oldNote.getNoteTextId())
                .knowledgeBaseId(StringUtils.isNotNull(updateParam.getKnowledgeBaseId())
                        ? updateParam.getKnowledgeBaseId() : oldNote.getKnowledgeBaseId())
                .status(oldNote.getStatus())
                .dataScope(oldNote.getDataScope())
                .permissions(oldNote.getPermissions())
                .deleted(oldNote.getDeleted())
                .noteText(oldNote.getNoteText())
                .content(StringUtils.isNotNull(updateParam.getContent()) ? updateParam.getContent() : oldNote.getContent())
                .notePermissions(oldNote.getNotePermissions())
                .knowledgeBaseName(oldNote.getKnowledgeBaseName())
                .submitTaskName(oldNote.getSubmitTaskName())
                .build();
        String destination = rocketMQProperties.getNoteTopic() +  ":" + NoteTagsEnum.GENERATOR_NOTE_INDEX.name();
        rocketMQTemplate.asyncSend(destination, updateParam.getId(), RocketmqSendCallbackBuilder.commonCallback());

        String generateNoteLogDestination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.GENERATE_NOTE_EDIT_LOG.name();
        rocketMQTemplate.asyncSend(generateNoteLogDestination, JSON.toJSONString(GenerateNoteEditLogMessage.builder()
                .noteId(updateParam.getId())
                .oldNote(oldNote)
                .currentNote(currentNote)
                .date(new Date())
                .userId(loginUser.getSysUser().getId())
                .build()), RocketmqSendCallbackBuilder.commonCallback());
        return NoteSaveResultVO.builder()
                .id(updateParam.getId())
                .title(currentNote.getTitle())
                .content(currentNote.getContent())
                .updateTime(updateTime)
                .version(NoteVersionUtil.toVersion(updateTime))
                .build();
    }

    @RequiresNotePermissions(NotePermissions.EDIT)
    @Override
    public MarkdownImage uploadNoteImage(NoteImageUploadParam uploadParam) {
        LoginUser loginUser = tokenUtil.getLoginUser();
//        FileUploadParam fileUploadParam = FileUploadParam.builder()
//                .file(uploadParam.getImage())
//                .path(StringUtils.format("note/{}", uploadParam.getId()))
//                .build();
        ResData<FilePO> fileDTOResData = remoteFileService.uploadFile(uploadParam.getImage(),
                StringUtils.format("note/{}", uploadParam.getId()), loginUser.getSysUser().getId(),
                StringUtils.isNotNull(uploadParam.getUploadId()) ? uploadParam.getUploadId() : UUID.randomUUID().toString().replace("-", ""),
                FileSources.NOTE_IMAGE.getValue());
        if (StringUtils.isNull(fileDTOResData) || StringUtils.isNull(fileDTOResData.getData())) {
            throw new BusinessException("图片保存失败", ResCode.INNER_FILE_SERVICE_ERROR);
        }

        if (!ResData.SUCCESS.equals(fileDTOResData.getCode())) {
            throw new BusinessException("图片保存失败", ResCode.INNER_FILE_SERVICE_ERROR);
        }
        FilePO filePO = fileDTOResData.getData();

//        NoteImage noteImage = NoteImage.builder()
//                .originalFileName(filePO.getOriginalFileName())
//                .fileName(filePO.getFileName())
//                .url(filePO.getUrl())
//                .userId(loginUser.getSysUser().getId())
//                .build();
//        noteImageService.getBaseMapper().insert(noteImage);

        // 异步保存笔记文件日志
        String destination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.SAVE_NOTE_FILE.name();
        rocketMQTemplate.asyncSend(destination, NoteFile.builder()
                        .fileId(filePO.getId())
                        .noteId(uploadParam.getNoteId())
                        .type(NoteFileType.NOTE_IMAGE.getValue())
                .build(), RocketmqSendCallbackBuilder.commonCallback());

        return MarkdownImage.builder()
                .image(MarkdownUtil.buildMarkdownImage(filePO.getOriginalFileName(),
                        filePO.getUrl()))
                .build();
    }

    @RequiresNotePermissions(NotePermissions.EDIT)
    @Override
    public OssSliceUploadTaskVO createNoteImageUploadTask(NoteImageUploadTaskCreateParam param) {
        // 权限已由 RequiresNotePermissions(EDIT) 在切面里校验：必须与 editNote 同一把锁，
        // 只校验登录是不够的——否则任何登录用户都能往别人笔记目录写对象。
        Note note = this.baseMapper.selectById(param.getId());
        if (StringUtils.isNull(note) || Objects.equals(note.getDeleted(), 1)) {
            throw new BusinessException("笔记不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
        // path 与 source 都在这里定死，绝不从请求体取：uploadId 就是后端颁发的临时凭据，
        // 让客户端自选前缀等于允许越权写入他人 note/{id}/images。
        return RemoteResDataUtil.getResData(remoteFileService.createOssSliceUploadTask(
                        new OssSliceUploadTaskCreateDTO(param.getCreateDTO(),
                                StringUtils.format(FileConstants.NOTE_IMAGE_PATH_TEMPLATE, param.getId()),
                                FileSources.NOTE_IMAGE.getValue())),
                "笔记图片上传任务创建失败");
    }

    @Override
    public NotePermissions getNotePermissions(Long noteId) {
        LambdaQueryWrapper<Note> noteLambdaQueryWrapper = new LambdaQueryWrapper<>();
        noteLambdaQueryWrapper
                .eq(Note::getId, noteId)
                .select(Note::getDataScope, Note::getCreateBy, Note::getPermissions);
        Note noteInfo = this.baseMapper.selectOne(noteLambdaQueryWrapper);
        if (StringUtils.isNull(noteInfo)) {
            throw new UserParamException("笔记不存在", ResCode.INVALID_USER_INPUT_NOT_FOUND);
        }
        LoginUser loginUser = tokenUtil.getLoginUser();
        SysUser sysUser = loginUser.getSysUser();

        if (SysUser.isAdminX(loginUser.getSysUser().getRole())) {
            return NotePermissions.MANAGE;
        }

        Integer knowledgeBasePermissions = knowledgeBaseService.getUserKnowledgeBasePermissionsByNoteId(sysUser.getId(), noteId);
        // 笔记所有者
        if (noteInfo.getCreateBy().equals(sysUser.getId())) {
            return this.permissionCompute(Integer.parseInt(noteInfo.getPermissions().substring(0, 1)));
        }
        // 非知识库成员
        if (StringUtils.isNull(knowledgeBasePermissions)) {
            return this.permissionCompute(Integer.parseInt(noteInfo.getPermissions().substring(3, 4)));
        }
        // 知识库管理员
        else if (KnowledgeBasePermissions.MANAGE.getValue() == knowledgeBasePermissions) {
            return this.permissionCompute(Integer.parseInt(noteInfo.getPermissions().substring(1, 2)));
        }
        // 知识库中有编辑权限的用户
        else if (KnowledgeBasePermissions.EDIT.getValue() == knowledgeBasePermissions) {
            return this.permissionCompute(Integer.parseInt(noteInfo.getPermissions().substring(2, 3)));
        }
        // 知识库中有阅读权限的用户
        else if (KnowledgeBasePermissions.READ.getValue() == knowledgeBasePermissions) {
            NotePermissions notePermissions = this.permissionCompute(Integer.valueOf(noteInfo.getPermissions().charAt(2)));
            if (NotePermissions.NO.getValue() < notePermissions.getValue()) {
                return NotePermissions.READ;
            }
        }
        return NotePermissions.NO;
    }

    private NotePermissions permissionCompute(Integer permission) {
        if (0 == permission) {
            return NotePermissions.NO;
        }
        else if (4 == permission) {
            return NotePermissions.READ;
        }
        else if (6 == permission) {
            return NotePermissions.EDIT;
        }
        else if (7 == permission) {
            return NotePermissions.MANAGE;
        }
        else {
            throw new BusinessException("笔记权限错误", ResCode.AUTH_ERROR);
        }
    }

    @Override
    public Integer getNoteDataScope(Long noteId) {
        LambdaQueryWrapper<Note> noteLambdaQueryWrapper = new LambdaQueryWrapper<>();
        noteLambdaQueryWrapper
                .eq(Note::getId, noteId)
                .select(Note::getDataScope);
        Note noteInfo = this.baseMapper.selectOne(noteLambdaQueryWrapper);
        return noteInfo.getDataScope();
    }

    @Override
    @RequiresNotePermissions(NotePermissions.EDIT)
    public HuaweiOBSTemporarySignature getImageUploadTempSignature(NoteImageUploadSignatureCreateParam createParam) {
        return RemoteResDataUtil.getResData(remoteFileService.createHuaweiOBSTemporarySignature(CreateHuaweiOBSTemporarySignatureDTO.builder()
                .contentType(createParam.getContentType())
                .expireSeconds(HuaweiOBSConstants.NOTE_IMAGE_TEMPORARY_SIGNATURE_EXPIRE_SECONDS)
                .fileName(createParam.getFileName())
                .path(StringUtils.format(FileConstants.NOTE_IMAGE_PATH_TEMPLATE, createParam.getNoteId(),
                        createParam.getNoteId()))
                .source(FileSources.NOTE_IMAGE.getValue()).build()), "上传图片失败");
    }

    @Override
    @RequiresNotePermissions(NotePermissions.EDIT)
    public String completeNoteImageUpload(NoteImageCompleteParam noteImageCompleteParam) {
        FilePO filePO = RemoteResDataUtil.getResData(remoteFileService.completeHuaweiOBSUpload(CompleteUploadDTO.builder()
                        .uploadId(noteImageCompleteParam.getUploadId())
                        .hash(noteImageCompleteParam.getHash())
                        .build()),
                "上传异常，请联系管理员");

        // 异步保存笔记文件日志
        String destination = rocketMQProperties.getNoteTopic() + ":" + NoteTagsEnum.SAVE_NOTE_FILE.name();
        rocketMQTemplate.asyncSend(destination, NoteFile.builder()
                .fileId(filePO.getId())
                .noteId(noteImageCompleteParam.getNoteId())
                .type(NoteFileType.NOTE_IMAGE.getValue())
                .build(), RocketmqSendCallbackBuilder.commonCallback());
        return Constants.SUCCESS_RES;
    }

}
