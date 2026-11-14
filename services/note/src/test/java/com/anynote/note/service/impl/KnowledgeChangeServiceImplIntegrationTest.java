package com.anynote.note.service.impl;

import com.anynote.note.enums.KnowledgeEntityType;
import com.anynote.note.enums.KnowledgeOperation;
import com.anynote.note.mapper.KnowledgeChangeMapper;
import com.anynote.note.model.po.KnowledgeChangePO;
import com.anynote.note.service.KnowledgeChangeService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import jakarta.annotation.Resource;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 使用真实数据库验证知识变更事务提交与回滚。
 *
 * @author 称霸幼儿园
 */
@Tag("integration")
@SpringBootTest
class KnowledgeChangeServiceImplIntegrationTest {

    private static final long COMMITTED_ENTITY_ID = Long.MAX_VALUE - 1_001L;
    private static final long ROLLED_BACK_ENTITY_ID = Long.MAX_VALUE - 1_002L;

    @Resource
    private KnowledgeChangeService knowledgeChangeService;
    @Resource
    private KnowledgeChangeMapper knowledgeChangeMapper;
    @Resource
    private TransactionTemplate transactionTemplate;

    /**
     * 提交记录可查询，业务异常后的变更记录随事务回滚。
     */
    @Test
    void commitsAndRollsBackWithBusinessTransaction() {
        Long committed = transactionTemplate.execute(status -> knowledgeChangeService.record(
                KnowledgeEntityType.NOTE, COMMITTED_ENTITY_ID, 0L, KnowledgeOperation.CREATE));
        try {
            assertThat(count(COMMITTED_ENTITY_ID)).isEqualTo(1L);

            assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(status -> {
                knowledgeChangeService.record(KnowledgeEntityType.NOTE, ROLLED_BACK_ENTITY_ID, 0L,
                        KnowledgeOperation.UPDATE);
                throw new IllegalStateException("rollback");
            })).isInstanceOf(IllegalStateException.class);

            assertThat(count(ROLLED_BACK_ENTITY_ID)).isZero();
        } finally {
            if (committed != null) {
                knowledgeChangeMapper.deleteById(committed);
            }
        }
    }

    private long count(long entityId) {
        return knowledgeChangeMapper.selectCount(new LambdaQueryWrapper<KnowledgeChangePO>()
                .eq(KnowledgeChangePO::getEntityId, entityId));
    }
}
