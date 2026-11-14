package com.anynote.note.mapper;

import com.anynote.note.model.po.KnowledgeChangePO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 知识变更记录 Mapper。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface KnowledgeChangeMapper extends BaseMapper<KnowledgeChangePO> {

    /**
     * 查询指定游标之后的记录。
     *
     * @param afterId 上一页游标
     * @param limit 页大小
     * @return 按 id 升序的记录
     */
    List<KnowledgeChangePO> selectAfter(@Param("afterId") long afterId, @Param("limit") int limit);

    /**
     * 查询最新游标记录。
     *
     * @return 最大 id 对应的记录，空表返回 null
     */
    KnowledgeChangePO selectLatest();
}
