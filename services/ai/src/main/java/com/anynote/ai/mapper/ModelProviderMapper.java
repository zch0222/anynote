package com.anynote.ai.mapper;

import com.anynote.ai.model.po.ModelProviderPO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 模型供应商目录 Mapper。
 *
 * <p>查询统一走 {@code ModelProviderMapper.xml} 中显式列映射的 resultMap，
 * 保证 {@code models} 列正确映射到 {@link ModelProviderPO#getModelsJson()}。
 * 新增/更新/删除沿用 MyBatis-Plus {@link BaseMapper} 的默认实现。</p>
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface ModelProviderMapper extends BaseMapper<ModelProviderPO> {

    /**
     * 查询全部供应商（含停用行），按主键升序。
     *
     * @return 供应商列表，空表返回空列表
     */
    List<ModelProviderPO> selectAll();

    /**
     * 按供应商唯一标识查询。
     *
     * @param providerKey 供应商标识
     * @return 供应商，不存在返回 {@code null}
     */
    ModelProviderPO selectByProviderKey(@Param("providerKey") String providerKey);
}
