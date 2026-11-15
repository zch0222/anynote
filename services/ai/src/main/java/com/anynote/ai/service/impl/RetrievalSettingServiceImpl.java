package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.RetrievalSettingMapper;
import com.anynote.ai.model.dto.RetrievalSettingUpdateDTO;
import com.anynote.ai.model.po.RetrievalSettingPO;
import com.anynote.ai.model.vo.RetrievalSettingVO;
import com.anynote.ai.service.RetrievalSettingService;
import com.anynote.core.exception.BusinessException;
import com.anynote.core.web.enums.ResCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 知识检索运行参数实现，单行表 id 固定为 1。
 *
 * @author 称霸幼儿园
 */
@Service
public class RetrievalSettingServiceImpl implements RetrievalSettingService {

    public static final long SETTING_ID = 1L;
    public static final String OUT_OF_RANGE_MESSAGE = "检索参数超出允许范围";
    private static final String INVALID_REQUEST_MESSAGE = "请求参数错误";

    private final RetrievalSettingMapper retrievalSettingMapper;

    /**
     * 构造检索参数服务。
     *
     * @param retrievalSettingMapper 检索参数映射器
     */
    public RetrievalSettingServiceImpl(RetrievalSettingMapper retrievalSettingMapper) {
        this.retrievalSettingMapper = retrievalSettingMapper;
    }

    /**
     * 返回未保存过时使用的默认参数。
     *
     * @return 默认参数，版本为 0
     */
    public static RetrievalSettingVO defaults() {
        return RetrievalSettingVO.builder()
                .rrfK(60)
                .channelCandidates(50)
                .keywordLexicalWeight(1.5)
                .keywordSemanticWeight(0.5)
                .questionLexicalWeight(1.0)
                .questionSemanticWeight(1.2)
                .defaultLexicalWeight(1.0)
                .defaultSemanticWeight(1.0)
                .itemWeight(0.8)
                .authorityOriginal(1.0)
                .authorityTranscript(0.9)
                .authorityGenerated(0.7)
                .maxChunksPerEntity(3)
                .searchDefaultLimit(10)
                .searchMaxLimit(20)
                .neighborWindow(1)
                .neighborMaxChars(6000)
                .readMaxChars(2000)
                .grepMaxHits(50)
                .grepContextDefault(2)
                .grepContextMax(5)
                .grepKbCandidates(20)
                .shortKeywordChars(4)
                .rerankEnabled(false)
                .version(0L)
                .build();
    }

    @Override
    public RetrievalSettingVO get() {
        RetrievalSettingPO saved = retrievalSettingMapper.selectSetting(SETTING_ID);
        return saved == null ? defaults() : toVO(saved);
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public RetrievalSettingVO update(RetrievalSettingUpdateDTO request, Long operatorId) {
        validate(request);
        long operator = operatorId == null ? 0L : operatorId;
        RetrievalSettingPO written = retrievalSettingMapper.selectSetting(SETTING_ID);
        if (written == null) {
            written = RetrievalSettingPO.builder()
                    .id(SETTING_ID)
                    .version(1L)
                    .createBy(operator)
                    .updateBy(operator)
                    .build();
            apply(written, request);
            retrievalSettingMapper.insert(written);
        } else {
            apply(written, request);
            written.setVersion((written.getVersion() == null ? 0L : written.getVersion()) + 1L);
            written.setUpdateBy(operator);
            retrievalSettingMapper.updateById(written);
        }
        RetrievalSettingPO refreshed = retrievalSettingMapper.selectSetting(SETTING_ID);
        return toVO(refreshed == null ? written : refreshed);
    }

    private void validate(RetrievalSettingUpdateDTO request) {
        if (request == null || request.getRerankEnabled() == null) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        requireRange(request.getRrfK(), 1, 1000);
        requireRange(request.getChannelCandidates(), 10, 200);
        requireRange(request.getKeywordLexicalWeight(), 0.0, 5.0);
        requireRange(request.getKeywordSemanticWeight(), 0.0, 5.0);
        requireRange(request.getQuestionLexicalWeight(), 0.0, 5.0);
        requireRange(request.getQuestionSemanticWeight(), 0.0, 5.0);
        requireRange(request.getDefaultLexicalWeight(), 0.0, 5.0);
        requireRange(request.getDefaultSemanticWeight(), 0.0, 5.0);
        requireRange(request.getItemWeight(), 0.0, 5.0);
        requireRange(request.getAuthorityOriginal(), 0.0, 5.0);
        requireRange(request.getAuthorityTranscript(), 0.0, 5.0);
        requireRange(request.getAuthorityGenerated(), 0.0, 5.0);
        requireRange(request.getMaxChunksPerEntity(), 1, 10);
        requireRange(request.getSearchDefaultLimit(), 1, 50);
        requireRange(request.getSearchMaxLimit(), 1, 50);
        requireRange(request.getNeighborWindow(), 0, 3);
        requireRange(request.getNeighborMaxChars(), 0, 20000);
        requireRange(request.getReadMaxChars(), 500, 20000);
        requireRange(request.getGrepMaxHits(), 1, 200);
        requireRange(request.getGrepContextDefault(), 0, 5);
        requireRange(request.getGrepContextMax(), 0, 10);
        requireRange(request.getGrepKbCandidates(), 1, 50);
        requireRange(request.getShortKeywordChars(), 1, 20);
        if (request.getSearchDefaultLimit() > request.getSearchMaxLimit()
                || request.getGrepContextDefault() > request.getGrepContextMax()) {
            throw new BusinessException(OUT_OF_RANGE_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private void requireRange(Integer value, int minimum, int maximum) {
        if (value == null) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (value < minimum || value > maximum) {
            throw new BusinessException(OUT_OF_RANGE_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private void requireRange(Double value, double minimum, double maximum) {
        if (value == null) {
            throw new BusinessException(INVALID_REQUEST_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
        if (value.isNaN() || value < minimum || value > maximum) {
            throw new BusinessException(OUT_OF_RANGE_MESSAGE, ResCode.USER_REQUEST_PARAM_ERROR);
        }
    }

    private void apply(RetrievalSettingPO target, RetrievalSettingUpdateDTO request) {
        target.setRrfK(request.getRrfK());
        target.setChannelCandidates(request.getChannelCandidates());
        target.setKeywordLexicalWeight(request.getKeywordLexicalWeight());
        target.setKeywordSemanticWeight(request.getKeywordSemanticWeight());
        target.setQuestionLexicalWeight(request.getQuestionLexicalWeight());
        target.setQuestionSemanticWeight(request.getQuestionSemanticWeight());
        target.setDefaultLexicalWeight(request.getDefaultLexicalWeight());
        target.setDefaultSemanticWeight(request.getDefaultSemanticWeight());
        target.setItemWeight(request.getItemWeight());
        target.setAuthorityOriginal(request.getAuthorityOriginal());
        target.setAuthorityTranscript(request.getAuthorityTranscript());
        target.setAuthorityGenerated(request.getAuthorityGenerated());
        target.setMaxChunksPerEntity(request.getMaxChunksPerEntity());
        target.setSearchDefaultLimit(request.getSearchDefaultLimit());
        target.setSearchMaxLimit(request.getSearchMaxLimit());
        target.setNeighborWindow(request.getNeighborWindow());
        target.setNeighborMaxChars(request.getNeighborMaxChars());
        target.setReadMaxChars(request.getReadMaxChars());
        target.setGrepMaxHits(request.getGrepMaxHits());
        target.setGrepContextDefault(request.getGrepContextDefault());
        target.setGrepContextMax(request.getGrepContextMax());
        target.setGrepKbCandidates(request.getGrepKbCandidates());
        target.setShortKeywordChars(request.getShortKeywordChars());
        target.setRerankEnabled(Boolean.TRUE.equals(request.getRerankEnabled()) ? 1 : 0);
    }

    private RetrievalSettingVO toVO(RetrievalSettingPO po) {
        return RetrievalSettingVO.builder()
                .rrfK(po.getRrfK())
                .channelCandidates(po.getChannelCandidates())
                .keywordLexicalWeight(po.getKeywordLexicalWeight())
                .keywordSemanticWeight(po.getKeywordSemanticWeight())
                .questionLexicalWeight(po.getQuestionLexicalWeight())
                .questionSemanticWeight(po.getQuestionSemanticWeight())
                .defaultLexicalWeight(po.getDefaultLexicalWeight())
                .defaultSemanticWeight(po.getDefaultSemanticWeight())
                .itemWeight(po.getItemWeight())
                .authorityOriginal(po.getAuthorityOriginal())
                .authorityTranscript(po.getAuthorityTranscript())
                .authorityGenerated(po.getAuthorityGenerated())
                .maxChunksPerEntity(po.getMaxChunksPerEntity())
                .searchDefaultLimit(po.getSearchDefaultLimit())
                .searchMaxLimit(po.getSearchMaxLimit())
                .neighborWindow(po.getNeighborWindow())
                .neighborMaxChars(po.getNeighborMaxChars())
                .readMaxChars(po.getReadMaxChars())
                .grepMaxHits(po.getGrepMaxHits())
                .grepContextDefault(po.getGrepContextDefault())
                .grepContextMax(po.getGrepContextMax())
                .grepKbCandidates(po.getGrepKbCandidates())
                .shortKeywordChars(po.getShortKeywordChars())
                .rerankEnabled(Integer.valueOf(1).equals(po.getRerankEnabled()))
                .version(po.getVersion() == null ? 0L : po.getVersion())
                .updateTime(po.getUpdateTime())
                .build();
    }
}
