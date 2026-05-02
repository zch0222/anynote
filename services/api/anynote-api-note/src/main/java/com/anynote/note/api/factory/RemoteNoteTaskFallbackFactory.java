package com.anynote.note.api.factory;

import com.anynote.core.web.enums.ResCode;
import com.anynote.core.web.model.bo.ResData;
import com.anynote.note.api.RemoteNoteTaskService;
import com.anynote.note.api.model.po.UserNoteTask;
import com.anynote.note.api.model.vo.AdminNoteTaskVO;
import com.anynote.note.api.model.vo.NoteTaskChartsVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class RemoteNoteTaskFallbackFactory implements FallbackFactory<RemoteNoteTaskService> {

    @Override
    public RemoteNoteTaskService create(Throwable cause) {
        return new RemoteNoteTaskService() {

            @Override
            public ResData<List<UserNoteTask>> getTaskUsers(Long taskId, String fromSource) {
                return ResData.error(ResCode.INNER_NOTE_SERVICE_ERROR);
            }

            @Override
            public ResData<List<NoteTaskChartsVO>> getNoteTaskChartsData(Long id, String fromSource, String accessToken) {
                return ResData.error(ResCode.INNER_NOTE_SERVICE_ERROR);
            }

            @Override
            public ResData<AdminNoteTaskVO> getAdminNoteTaskById(Long id, String fromSource, String accessToken) {
                return ResData.error(ResCode.INNER_NOTE_SERVICE_ERROR);
            }
        };
    }
}
