package com.anynote.ai.mapper;

import com.anynote.ai.model.po.RetrievalSettingPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 检索参数映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface RetrievalSettingMapper extends BaseMapper<RetrievalSettingPO> {

    /**
     * 按主键读取检索参数行。
     *
     * @param id 主键，固定为 1
     * @return 参数行，不存在返回 null
     */
    RetrievalSettingPO selectSetting(@Param("id") Long id);
}
