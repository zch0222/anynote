package com.anynote.notify.mapper;

import com.anynote.notify.api.model.po.Notice;
import com.anynote.notify.model.po.KnowledgeNoticeExportPO;
import com.anynote.notify.model.vo.NoticeVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 通知数据访问映射器。
 *
 * @author 称霸幼儿园
 */
@Mapper
public interface NoticeMapper extends BaseMapper<Notice> {

    public List<NoticeVO> selectNoticeList(@Param("userId") Long userId);

    /**
     * 按主键游标扫描知识库通知记录。
     *
     * @param afterId 上一页最后扫描的通知 id
     * @param scanLimit 扫描条数上限
     * @return 知识库通知导出映射列表
     */
    List<KnowledgeNoticeExportPO> selectKnowledgeNoticesPage(@Param("afterId") long afterId,
                                                             @Param("scanLimit") int scanLimit);

    /**
     * 按 id 批量查询有效的知识库通知记录。
     *
     * @param ids 通知 id 列表
     * @return 有效知识库通知映射列表
     */
    List<KnowledgeNoticeExportPO> selectKnowledgeNoticesByIds(@Param("ids") List<Long> ids);
}
