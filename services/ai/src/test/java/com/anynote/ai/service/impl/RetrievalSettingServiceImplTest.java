package com.anynote.ai.service.impl;

import com.anynote.ai.mapper.RetrievalSettingMapper;
import com.anynote.ai.model.dto.RetrievalSettingUpdateDTO;
import com.anynote.ai.model.po.RetrievalSettingPO;
import com.anynote.ai.model.vo.RetrievalSettingVO;
import com.anynote.core.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 检索参数默认值、校验与版本推进单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
class RetrievalSettingServiceImplTest {

    @Mock
    private RetrievalSettingMapper mapper;

    private RetrievalSettingServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new RetrievalSettingServiceImpl(mapper);
    }

    /**
     * 未保存过时返回默认值且版本为 0。
     */
    @Test
    void getReturnsDefaultsWhenNoRow() {
        when(mapper.selectSetting(1L)).thenReturn(null);

        RetrievalSettingVO result = service.get();

        assertEquals(60, result.getRrfK());
        assertEquals(1.5, result.getKeywordLexicalWeight());
        assertEquals(0.7, result.getAuthorityGenerated());
        assertEquals(2000, result.getReadMaxChars());
        assertFalse(result.getRerankEnabled());
        assertEquals(0L, result.getVersion());
    }

    /**
     * 首次保存插入 id=1、版本 1 的行并记录操作人。
     */
    @Test
    void firstUpdateInsertsRowWithVersionOne() {
        when(mapper.selectSetting(1L)).thenReturn(null);
        RetrievalSettingUpdateDTO request = validRequest();
        request.setRrfK(30);
        request.setRerankEnabled(true);

        RetrievalSettingVO result = service.update(request, 9L);

        ArgumentCaptor<RetrievalSettingPO> captor = ArgumentCaptor.forClass(RetrievalSettingPO.class);
        verify(mapper).insert(captor.capture());
        assertEquals(1L, captor.getValue().getId());
        assertEquals(1L, captor.getValue().getVersion());
        assertEquals(9L, captor.getValue().getCreateBy());
        assertEquals(1, captor.getValue().getRerankEnabled());
        assertEquals(30, result.getRrfK());
        assertTrue(result.getRerankEnabled());
    }

    /**
     * 已有行时整体覆盖并把版本加一。
     */
    @Test
    void updateExistingRowAdvancesVersion() {
        RetrievalSettingPO existing = RetrievalSettingPO.builder().id(1L).version(4L).rrfK(60).build();
        when(mapper.selectSetting(1L)).thenReturn(existing);
        RetrievalSettingUpdateDTO request = validRequest();
        request.setMaxChunksPerEntity(5);

        service.update(request, 2L);

        ArgumentCaptor<RetrievalSettingPO> captor = ArgumentCaptor.forClass(RetrievalSettingPO.class);
        verify(mapper).updateById(captor.capture());
        assertEquals(5L, captor.getValue().getVersion());
        assertEquals(5, captor.getValue().getMaxChunksPerEntity());
        assertEquals(2L, captor.getValue().getUpdateBy());
    }

    /**
     * 整数参数越界返回「检索参数超出允许范围」且不写库。
     */
    @Test
    void rejectsIntegerOutOfRange() {
        RetrievalSettingUpdateDTO request = validRequest();
        request.setReadMaxChars(499);

        BusinessException error = assertThrows(BusinessException.class, () -> service.update(request, 1L));

        assertEquals(RetrievalSettingServiceImpl.OUT_OF_RANGE_MESSAGE, error.getMessage());
        verify(mapper, never()).insert(any(RetrievalSettingPO.class));
    }

    /**
     * 权重越界同样被拒绝。
     */
    @Test
    void rejectsWeightOutOfRange() {
        RetrievalSettingUpdateDTO request = validRequest();
        request.setItemWeight(5.01);

        BusinessException error = assertThrows(BusinessException.class, () -> service.update(request, 1L));

        assertEquals(RetrievalSettingServiceImpl.OUT_OF_RANGE_MESSAGE, error.getMessage());
    }

    /**
     * 默认条数大于上限、默认上下文大于最大上下文时被拒绝。
     */
    @Test
    void rejectsDefaultGreaterThanMaximum() {
        RetrievalSettingUpdateDTO limits = validRequest();
        limits.setSearchDefaultLimit(30);
        limits.setSearchMaxLimit(20);
        assertEquals(RetrievalSettingServiceImpl.OUT_OF_RANGE_MESSAGE,
                assertThrows(BusinessException.class, () -> service.update(limits, 1L)).getMessage());

        RetrievalSettingUpdateDTO context = validRequest();
        context.setGrepContextDefault(4);
        context.setGrepContextMax(3);
        assertEquals(RetrievalSettingServiceImpl.OUT_OF_RANGE_MESSAGE,
                assertThrows(BusinessException.class, () -> service.update(context, 1L)).getMessage());
    }

    /**
     * 缺少字段时返回既有的请求参数错误文案。
     */
    @Test
    void rejectsMissingField() {
        RetrievalSettingUpdateDTO request = validRequest();
        request.setRerankEnabled(null);

        BusinessException error = assertThrows(BusinessException.class, () -> service.update(request, 1L));

        assertEquals("请求参数错误", error.getMessage());
    }

    /**
     * 构造与默认值一致的合法请求。
     *
     * @return 更新请求
     */
    static RetrievalSettingUpdateDTO validRequest() {
        RetrievalSettingVO defaults = RetrievalSettingServiceImpl.defaults();
        RetrievalSettingUpdateDTO request = new RetrievalSettingUpdateDTO();
        request.setRrfK(defaults.getRrfK());
        request.setChannelCandidates(defaults.getChannelCandidates());
        request.setKeywordLexicalWeight(defaults.getKeywordLexicalWeight());
        request.setKeywordSemanticWeight(defaults.getKeywordSemanticWeight());
        request.setQuestionLexicalWeight(defaults.getQuestionLexicalWeight());
        request.setQuestionSemanticWeight(defaults.getQuestionSemanticWeight());
        request.setDefaultLexicalWeight(defaults.getDefaultLexicalWeight());
        request.setDefaultSemanticWeight(defaults.getDefaultSemanticWeight());
        request.setItemWeight(defaults.getItemWeight());
        request.setAuthorityOriginal(defaults.getAuthorityOriginal());
        request.setAuthorityTranscript(defaults.getAuthorityTranscript());
        request.setAuthorityGenerated(defaults.getAuthorityGenerated());
        request.setMaxChunksPerEntity(defaults.getMaxChunksPerEntity());
        request.setSearchDefaultLimit(defaults.getSearchDefaultLimit());
        request.setSearchMaxLimit(defaults.getSearchMaxLimit());
        request.setNeighborWindow(defaults.getNeighborWindow());
        request.setNeighborMaxChars(defaults.getNeighborMaxChars());
        request.setReadMaxChars(defaults.getReadMaxChars());
        request.setGrepMaxHits(defaults.getGrepMaxHits());
        request.setGrepContextDefault(defaults.getGrepContextDefault());
        request.setGrepContextMax(defaults.getGrepContextMax());
        request.setGrepKbCandidates(defaults.getGrepKbCandidates());
        request.setShortKeywordChars(defaults.getShortKeywordChars());
        request.setRerankEnabled(defaults.getRerankEnabled());
        return request;
    }
}
