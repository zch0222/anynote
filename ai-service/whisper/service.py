"""Whisper 子进程转写与 Redis 状态流。

@author 称霸幼儿园
"""

import asyncio
import json
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from pathlib import Path

import httpx
import redis
import redis.asyncio as async_redis

from core.logger import get_logger
from whisper.models import AudioTranscriptionDTO


def _publish(redis_url: str, channel: str, payload: dict) -> None:
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    try:
        client.publish(channel, json.dumps(payload, ensure_ascii=False))
    finally:
        client.close()


def _run_transcription(
    data: AudioTranscriptionDTO,
    task_id: str,
    redis_url: str,
    data_path: str,
) -> None:
    """在子进程中下载并转写音频。

    :param data: 转写请求
    :param task_id: 任务标识
    :param redis_url: Redis 地址
    :param data_path: 可写临时目录
    """
    channel = f"WHISPER_TASK:{task_id}"
    _publish(redis_url, channel, {"id": task_id, "status": "DOWNLOADING", "result": ""})
    audio_path = Path(data_path) / "whisper" / f"{uuid.uuid4()}.audio"
    try:
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", data.file_url, timeout=60.0) as response:
            response.raise_for_status()
            with audio_path.open("wb") as output:
                for chunk in response.iter_bytes(8192):
                    output.write(chunk)
        _publish(redis_url, channel, {"id": task_id, "status": "RUNNING", "result": ""})
        import whisper

        model = whisper.load_model(data.model)
        result = model.transcribe(str(audio_path), language=data.language, verbose=False)
        _publish(
            redis_url,
            channel,
            {
                "id": task_id,
                "status": "DONE",
                "result": {
                    "srt": WhisperService.segments_to_srt(result["segments"]),
                    "text": result.get("text"),
                },
            },
        )
    except Exception as error:
        _publish(redis_url, channel, {"id": task_id, "status": "FAILED", "result": str(error)})
    finally:
        audio_path.unlink(missing_ok=True)


class WhisperService:
    """提供音频转写状态流。

    @author 称霸幼儿园
    """

    def __init__(self, executor: ProcessPoolExecutor, redis_url: str, data_path: str):
        self._executor = executor
        self._redis_url = redis_url
        self._data_path = data_path
        self._logger = get_logger(__name__)

    async def transcriptions(self, data: AudioTranscriptionDTO, task_id: str):
        """执行转写并生成旧状态语义的 SSE 帧。

        :param data: 转写请求
        :param task_id: 任务标识
        :return: SSE 异步序列
        """
        channel = f"WHISPER_TASK:{task_id}"
        client = async_redis.from_url(self._redis_url, decode_responses=True)
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        heartbeat = asyncio.create_task(self._heartbeat(client, channel, task_id))
        asyncio.get_running_loop().run_in_executor(
            self._executor,
            partial(_run_transcription, data, task_id, self._redis_url, self._data_path),
        )
        try:
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not message:
                    continue
                payload = message["data"]
                yield f"id: {int(time.time())}\nevent: message\ndata: {payload}\n\n"
                status = json.loads(payload)["status"]
                if status in {"DONE", "FAILED"}:
                    break
        finally:
            heartbeat.cancel()
            try:
                await heartbeat
            except asyncio.CancelledError:
                pass
            await pubsub.close()
            await client.close()

    async def _heartbeat(self, client, channel: str, task_id: str) -> None:
        while True:
            await client.publish(
                channel,
                json.dumps({"id": task_id, "status": "HEARTBEAT", "result": ""}),
            )
            await asyncio.sleep(5)

    @staticmethod
    def segments_to_srt(segments) -> str:
        """将 Whisper 片段转换为 SRT。

        :param segments: Whisper 时间片
        :return: SRT 文本
        """
        def timestamp(seconds: float) -> str:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds - int(seconds)) * 1000)
            return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

        lines = []
        for index, segment in enumerate(segments):
            lines.extend(
                [
                    str(index + 1),
                    f"{timestamp(segment['start'])} --> {timestamp(segment['end'])}",
                    segment["text"].strip(),
                    "",
                ]
            )
        return "\n".join(lines)
