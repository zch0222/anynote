import whisper
from constants.whiser_constants import WHISPER_FILE_PATH
from model.dto import FileDownloadDTO
from utils.file_util import download_file
from model.dto import AudioTranscriptionDTO
from core.redis_server import RedisServer
from constants.redis_channel_constants import WHISPER_TASK_CHANNEL
import asyncio
from enums.whisper_task_status import WhisperTaskStatus
from core.logger import get_logger
from concurrent.futures import ProcessPoolExecutor
import json, time

class WhisperService:

    def __init__(self):
        self.logger = get_logger()
        pass

    def whisper_segments_to_srt(self, segments) -> str:
        # 定义一个帮助函数，用于将秒数转化为 SRT 时间格式（HH:MM:SS,mmm）
        def seconds_to_srt_time(seconds: float) -> str:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            ms = int((seconds - int(seconds)) * 1000)
            return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"
        srt_lines = []
        for i, seg in enumerate(segments):
            start_time = seconds_to_srt_time(seg["start"])
            end_time = seconds_to_srt_time(seg["end"])
            text = seg["text"].strip()
            
            srt_lines.append(str(i + 1))  # SRT 的段落序号
            srt_lines.append(f"{start_time} --> {end_time}")
            srt_lines.append(text)
            srt_lines.append("")  # 分隔空行
        return "\n".join(srt_lines)

    def get_whisper_model(self, model_name: str = 'turbo'):
        return whisper.load_model(model_name)

    def get_transcribe(self, model, audio: str, language: str = 'en'):
        self.logger.info(f"WHISPER_TASK: audio={audio}, language={language}")
        return model.transcribe(audio=audio, language=language, verbose=True)
    
    def download_audio(self, file_url: str) -> FileDownloadDTO:
        return download_file(url=file_url, dest_folder=WHISPER_FILE_PATH)
    

    async def send_heartbeat(self, task_id: str):
        redis_server = RedisServer()
        while True:
            self.logger.info(f"WHISPER_TASK: {task_id}, heartbeat")
            redis_server.publish(f"{WHISPER_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": "HEARTBEAT",
                "result": ""
            })
            await asyncio.sleep(5)
    
    def run_transcriptions(self, data: AudioTranscriptionDTO, task_id: str):
        redis_server = RedisServer()
        redis_server.publish(f"{WHISPER_TASK_CHANNEL}:{task_id}", {
            "id": task_id,
            "status": WhisperTaskStatus.DOWNLOADING,
            "result": ""
        })
        try:
            file_download_dto = self.download_audio(data.file_url)
            redis_server.publish(f"{WHISPER_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": WhisperTaskStatus.RUNNING,
                "result": ""
            })
            model = self.get_whisper_model(model_name=data.model)
            result = self.get_transcribe(model=model, audio=file_download_dto.file_path, language=data.language)
            segments = result['segments']
            redis_server.publish(f"{WHISPER_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": WhisperTaskStatus.DONE,
                "result": {
                    "srt": self.whisper_segments_to_srt(segments),
                    "text": result.get('text')
                }
            })
        except Exception as e:
            self.logger.exception(e)
            redis_server.publish(f"{WHISPER_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": WhisperTaskStatus.FAILED,
                "result": str(e)
            })

    async def transcriptions(self, data: AudioTranscriptionDTO, task_id: str):
        executor = ProcessPoolExecutor(max_workers=1)
        executor.submit(self.run_transcriptions, data, task_id)
        hearbeat_task = asyncio.create_task(self.send_heartbeat(task_id=task_id))

        try:
            async for msg in RedisServer().subscribe(f"{WHISPER_TASK_CHANNEL}:{task_id}"):
                self.logger.info(msg=msg)
                msg_data = json.loads(msg)
                yield 'id: {}\nevent: message\ndata: {}\n\n'.format(int(time.time()), msg)
                if (msg_data["status"] == WhisperTaskStatus.DONE or msg_data["status"] == WhisperTaskStatus.FAILED):
                    break
        except Exception as e:
            self.logger.exception(e)
        finally:
            executor.shutdown(wait=True)
            if not hearbeat_task.done():
                hearbeat_task.cancel()
        

        

    
