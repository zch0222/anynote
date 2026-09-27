package com.anynote.note.mapper;

import com.anynote.common.datascope.annotation.DataScopeInterceptor;
import com.anynote.note.api.model.po.Note;
import com.anynote.note.datascope.annotation.NoteDataScopeInterceptor;
import com.anynote.note.model.bo.NoteQueryParam;
import com.anynote.note.model.bo.NoteUpdateParam;
import com.anynote.note.model.vo.NoteListVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

/**
 * 笔记 Mapper
 * @author 称霸幼儿园
 */
@Mapper
public interface NoteMapper extends BaseMapper<Note> {


    @DataScopeInterceptor
    @NoteDataScopeInterceptor
    public List<Note> selectNoteInfoList(NoteQueryParam queryParam);

    public List<NoteListVO> selectNoteList(NoteQueryParam queryParam);

    /**
     * 获取note id
     * @return
     */
//    @NoteDataScopeInterceptor
    public Note selectNoteById(NoteQueryParam queryParam);

//    @NoteDataScopeInterceptor
    public Integer updateNote(NoteUpdateParam updateParam);

    public Integer updateContent(NoteUpdateParam updateParam);

    /**
     * 带版本条件的原子更新：只有 {@code update_time} 仍等于 {@code baseUpdateTime} 时才写入。
     *
     * @param id             笔记id
     * @param title          新标题，为空表示不修改
     * @param updateTime     新的更新时间（即新版本号）
     * @param updateBy       更新者
     * @param baseUpdateTime 写入所基于的更新时间（即基准版本号）
     * @return 影响行数，0 表示版本已过期或笔记不存在
     */
    public Integer updateNoteIfVersion(@Param("id") Long id,
                                       @Param("title") String title,
                                       @Param("updateTime") Date updateTime,
                                       @Param("updateBy") Long updateBy,
                                       @Param("baseUpdateTime") Date baseUpdateTime);
}
