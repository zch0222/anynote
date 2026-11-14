package com.anynote.note.service.impl;

import com.anynote.common.redis.service.RedisService;
import com.anynote.common.security.token.TokenUtil;
import com.anynote.note.api.model.dto.MoocAsrInfoUpdateDTO;
import com.anynote.note.constant.MoocItemType;
import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.MoocMapper;
import com.anynote.note.model.bo.MoocAsrTaskInfo;
import com.anynote.note.model.bo.MoocCreateParam;
import com.anynote.note.model.bo.MoocItemBatchDeleteItemParam;
import com.anynote.note.model.bo.MoocItemCreateParam;
import com.anynote.note.model.bo.MoocItemUpdateParam;
import com.anynote.note.model.bo.MoocParam;
import com.anynote.note.model.bo.MoocUpdateParam;
import com.anynote.note.model.po.MoocItemPO;
import com.anynote.note.model.po.MoocPO;
import com.anynote.note.model.po.MoocVideoItemInfoPO;
import com.anynote.note.service.KnowledgeChangeService;
import com.anynote.note.service.MoocItemService;
import com.anynote.note.service.MoocItemTextService;
import com.anynote.note.service.MoocVideoItemInfoService;
import com.anynote.system.api.model.bo.LoginUser;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 慕课、条目与字幕写入时的知识变更单元测试。
 *
 * @author 称霸幼儿园
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MoocServiceImplKnowledgeChangeTest {

    private static final long MOOC_ID = 5L;
    private static final long KNOWLEDGE_BASE_ID = 3L;

    @Mock private MoocMapper moocMapper;
    @Mock private TokenUtil tokenUtil;
    @Mock private MoocItemService itemService;
    @Mock private MoocItemTextService itemTextService;
    @Mock private MoocVideoItemInfoService videoInfoService;
    @Mock private RedisService redisService;
    @Mock private KnowledgeChangeService changeService;

    private MoocServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        Class<?>[] types = {MoocItemPO.class, MoocVideoItemInfoPO.class};
        for (Class<?> type : types) {
            if (TableInfoHelper.getTableInfo(type) == null) {
                TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), type);
            }
        }
    }

    @BeforeEach
    void setUp() {
        service = new MoocServiceImpl();
        ReflectionTestUtils.setField(service, "baseMapper", moocMapper);
        ReflectionTestUtils.setField(service, "tokenUtil", tokenUtil);
        ReflectionTestUtils.setField(service, "moocItemService", itemService);
        ReflectionTestUtils.setField(service, "moocItemTextService", itemTextService);
        ReflectionTestUtils.setField(service, "moocVideoItemInfoService", videoInfoService);
        ReflectionTestUtils.setField(service, "redisService", redisService);
        ReflectionTestUtils.setField(service, "knowledgeChangeService", changeService);
        LoginUser loginUser = new LoginUser();
        loginUser.setUserId(7L);
        when(tokenUtil.getLoginUser()).thenReturn(loginUser);
        when(moocMapper.selectById(MOOC_ID)).thenReturn(
                MoocPO.builder().id(MOOC_ID).knowledgeBaseId(KNOWLEDGE_BASE_ID).build());
        when(itemTextService.saveBatch(anyCollection())).thenReturn(true);
        when(videoInfoService.saveBatch(anyCollection())).thenReturn(true);
    }

    /**
     * 新建慕课后按新慕课 id 与所属知识库记录 MOOC CREATE。
     */
    @Test
    void createMoocRecordsCreate() {
        when(moocMapper.insert(any(MoocPO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, MoocPO.class).setId(MOOC_ID);
            return 1;
        });
        MoocCreateParam param = MoocCreateParam.MoocCreateParamBuilder()
                .title("慕课").knowledgeBaseId(KNOWLEDGE_BASE_ID).dataScope(3).build();

        service.createMooc(param);

        verify(changeService).record(KnowledgeEntityType.MOOC, MOOC_ID, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.CREATE);
    }

    /**
     * 更新参数未带知识库时使用慕课当前知识库记录 MOOC UPDATE。
     */
    @Test
    void updateMoocUsesCurrentKnowledgeBaseWhenMissing() {
        when(moocMapper.updateById(any(MoocPO.class))).thenReturn(1);
        MoocUpdateParam param = new MoocUpdateParam();
        param.setMoocId(MOOC_ID);
        param.setTitle("慕课");

        service.updateMooc(param);

        verify(changeService).record(KnowledgeEntityType.MOOC, MOOC_ID, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.UPDATE);
    }

    /**
     * 更新参数带知识库时使用参数中的知识库记录 MOOC UPDATE。
     */
    @Test
    void updateMoocUsesRequestedKnowledgeBase() {
        when(moocMapper.updateById(any(MoocPO.class))).thenReturn(1);
        MoocUpdateParam param = new MoocUpdateParam();
        param.setMoocId(MOOC_ID);
        param.setKnowledgeBaseId(9L);

        service.updateMooc(param);

        verify(changeService).record(KnowledgeEntityType.MOOC, MOOC_ID, 9L, KnowledgeOperation.UPDATE);
    }

    /**
     * 删除慕课使用删除前的知识库记录 MOOC DELETE。
     */
    @Test
    void deleteMoocRecordsPreviousKnowledgeBase() {
        when(moocMapper.deleteById(MOOC_ID)).thenReturn(1);

        service.deleteMooc(MoocParam.MoocParamBuilder().moocId(MOOC_ID).build());

        verify(changeService).record(KnowledgeEntityType.MOOC, MOOC_ID, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.DELETE);
    }

    /**
     * 批量新建条目为每个新条目各记录一条 MOOC_ITEM CREATE。
     */
    @Test
    @SuppressWarnings("unchecked")
    void createItemsRecordsEachItem() {
        when(itemService.saveBatch(anyCollection())).thenAnswer(invocation -> {
            List<MoocItemPO> items = invocation.getArgument(0, List.class);
            items.get(0).setId(21L);
            items.get(1).setId(22L);
            return true;
        });
        MoocItemCreateParam param = MoocItemCreateParam.MoocItemCreateParamBuilder()
                .moocId(MOOC_ID)
                .items(List.of(
                        MoocItemCreateParam.Item.builder().title("视频").moocItemType(MoocItemType.VIDEO)
                                .parentId(0L).build(),
                        MoocItemCreateParam.Item.builder().title("文档").moocItemType(MoocItemType.DOC)
                                .parentId(0L).itemText("# 正文").build()))
                .build();

        service.createItems(param);

        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 21L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.CREATE);
        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 22L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.CREATE);
    }

    /**
     * 单个新建条目后记录 MOOC_ITEM CREATE。
     */
    @Test
    void createSingleItemRecordsCreate() {
        when(itemService.save(any(MoocItemPO.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, MoocItemPO.class).setId(23L);
            return true;
        });
        MoocItemCreateParam param = MoocItemCreateParam.MoocItemCreateParamBuilder()
                .moocId(MOOC_ID)
                .items(List.of(MoocItemCreateParam.Item.builder().title("文档")
                        .moocItemType(MoocItemType.DOC).parentId(0L).build()))
                .build();

        service.createSingleItem(param);

        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 23L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.CREATE);
    }

    /**
     * 更新条目后记录 MOOC_ITEM UPDATE。
     */
    @Test
    void updateMoocItemRecordsUpdate() {
        when(itemService.update(any(MoocItemPO.class), any(Wrapper.class))).thenReturn(true);
        MoocItemUpdateParam param = MoocItemUpdateParam.MoocItemUpdateParamBuilder()
                .moocId(MOOC_ID).moocItemId(21L).title("条目").parentId(0L).build();

        service.updateMoocItem(param);

        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 21L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.UPDATE);
    }

    /**
     * 批量删除条目时，被删条目及其下级各记录一条 MOOC_ITEM DELETE。
     */
    @Test
    void batchDeleteRecordsItemAndDescendants() {
        when(itemService.list(any(Wrapper.class))).thenReturn(List.of(
                MoocItemPO.builder().id(21L).moocId(MOOC_ID).parentId(0L).build(),
                MoocItemPO.builder().id(22L).moocId(MOOC_ID).parentId(21L).build(),
                MoocItemPO.builder().id(23L).moocId(MOOC_ID).parentId(0L).build()));
        when(itemService.removeByIds(anyCollection())).thenReturn(true);

        service.batchDeleteMoocItems(MoocItemBatchDeleteItemParam.MoocItemBatchDeleteItemParamBuilder()
                .moocId(MOOC_ID).itemIds(List.of(21L)).build());

        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 21L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.DELETE);
        verify(changeService).record(KnowledgeEntityType.MOOC_ITEM, 22L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.DELETE);
        verify(changeService, never()).record(eq(KnowledgeEntityType.MOOC_ITEM), eq(23L), anyLong(),
                eq(KnowledgeOperation.DELETE));
    }

    /**
     * 批量删除没有删掉任何条目时不记录变更。
     */
    @Test
    void batchDeleteWithoutRemovalRecordsNothing() {
        when(itemService.list(any(Wrapper.class))).thenReturn(List.of(
                MoocItemPO.builder().id(21L).moocId(MOOC_ID).parentId(0L).build()));
        when(itemService.removeByIds(anyCollection())).thenReturn(false);

        service.batchDeleteMoocItems(MoocItemBatchDeleteItemParam.MoocItemBatchDeleteItemParamBuilder()
                .moocId(MOOC_ID).itemIds(List.of(21L)).build());

        verify(changeService, never()).record(any(), anyLong(), anyLong(), any());
    }

    /**
     * Whisper 回写字幕后按视频条目记录 TRANSCRIPT UPDATE。
     */
    @Test
    void updateAsrInfoRecordsTranscript() {
        when(redisService.<MoocAsrTaskInfo>getCacheObject("mooc_asr_task:taskId:9")).thenReturn(
                MoocAsrTaskInfo.builder().taskId(9L).moocId(MOOC_ID).moocItemId(21L).build());
        when(videoInfoService.update(any(Wrapper.class))).thenReturn(true);

        service.updateAsrInfo(MoocAsrInfoUpdateDTO.builder().taskId(9L).srtObjectName("a.srt").build());

        verify(changeService).record(KnowledgeEntityType.TRANSCRIPT, 21L, KNOWLEDGE_BASE_ID,
                KnowledgeOperation.UPDATE);
    }
}
