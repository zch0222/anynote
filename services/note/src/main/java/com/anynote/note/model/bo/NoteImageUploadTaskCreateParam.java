package com.anynote.note.model.bo;

import com.anynote.file.api.model.dto.OssSliceUploadTaskCreatePublicDTO;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 笔记图片上传任务创建参数。
 * <p>
 * 继承 {@link NoteQueryParam} 是为了复用 {@code RequiresNotePermissionsAspect} 的约定：
 * 切面从第一个参数取 {@code NoteQueryParam} 并用其中的 id 查笔记权限，因此权限注解
 * 与参数类型是配套的，不能换成普通 POJO（那样切面会直接跳过校验）。
 * <p>
 * 这里不加 {@code @Builder}：父类已有 builder，Lombok 生成的子类 builder 无法继承
 * 父类 builder 的类型，会在编译期报 "无法覆盖"。
 *
 * @author 称霸幼儿园
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NoteImageUploadTaskCreateParam extends NoteQueryParam {

    /**
     * 浏览器侧提交的公开字段（fileName / hash / fileSize / contentType）。
     * 注意其中**不含** path 与 source：两者由服务端按笔记归属决定。
     */
    private OssSliceUploadTaskCreatePublicDTO createDTO;

    /**
     * 用笔记 id 构造权限切面所需的查询参数。
     * @param noteId 笔记id
     * @param createDTO 浏览器提交的公开字段
     */
    public NoteImageUploadTaskCreateParam(Long noteId, OssSliceUploadTaskCreatePublicDTO createDTO) {
        this.setId(noteId);
        this.createDTO = createDTO;
    }
}
