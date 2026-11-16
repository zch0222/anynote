"""应用配置与运行时配置模型。

@author 称霸幼儿园
"""

from functools import lru_cache
from threading import Lock

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic_settings import BaseSettings


def _kebab_case(value: str) -> str:
    return value.replace("_", "-")


class HarnessRuntimeSettings(BaseModel):
    """Harness 热更新配置。

    @author 称霸幼儿园
    """

    model_turns: int = Field(default=8, ge=1, le=100)
    tool_calls: int = Field(default=16, ge=1, le=1000)
    wall_clock_s: float = Field(default=90.0, gt=0, le=3600)
    context_tokens: int = Field(default=24000, ge=1024, le=200000)
    tool_timeout_s: float = Field(default=30.0, gt=0, le=600)
    connect_timeout_s: float = Field(default=3.0, gt=0, le=60)
    first_output_timeout_s: float = Field(default=30.0, gt=0, le=600)
    stream_idle_timeout_s: float = Field(default=30.0, gt=0, le=600)
    total_timeout_s: float = Field(default=120.0, gt=0, le=3600)
    heartbeat_interval_s: float = Field(default=5.0, gt=0, le=10)
    history_recent_messages: int = Field(default=6, ge=2, le=100)
    history_compaction_threshold: int = Field(default=8, ge=2, le=200)
    large_result_chars: int = Field(default=2000, ge=200, le=100000)
    large_result_preview_chars: int = Field(default=500, ge=50, le=10000)
    model_max_attempts: int = Field(default=2, ge=1, le=5)
    prefetch_enabled: bool = False

    model_config = ConfigDict(
        alias_generator=_kebab_case,
        populate_by_name=True,
        protected_namespaces=(),
    )


class IndexerRuntimeSettings(BaseModel):
    """索引管线热更新配置。

    @author 称霸幼儿园
    """

    poll_interval_s: float = Field(default=3.0, gt=0, le=300)
    reconcile_interval_s: float = Field(default=3600.0, ge=0, le=86400)
    batch_size: int = Field(default=50, ge=1, le=200)
    chunk_size_chars: int = Field(default=600, ge=100, le=4000)
    summary_body_chars: int = Field(default=200, ge=0, le=2000)
    embedding_batch_size: int = Field(default=16, ge=1, le=128)
    embedding_timeout_s: float = Field(default=30.0, gt=0, le=300)
    pdf_parse_timeout_s: float = Field(default=30.0, gt=0, le=300)
    pdf_max_memory_mb: int = Field(default=512, ge=64, le=4096)
    pdf_max_bytes: int = Field(default=50 * 1024 * 1024, ge=1024, le=500 * 1024 * 1024)
    es_index_replicas: int = Field(default=0, ge=0, le=5)
    es_request_timeout_s: float = Field(default=15.0, gt=0, le=120)

    model_config = ConfigDict(
        alias_generator=_kebab_case,
        populate_by_name=True,
        protected_namespaces=(),
    )


class RuntimeSettings(BaseModel):
    """Nacos 下发的非敏感运行配置。

    @author 称霸幼儿园
    """

    harness: HarnessRuntimeSettings = HarnessRuntimeSettings()
    indexer: IndexerRuntimeSettings = IndexerRuntimeSettings()

    model_config = ConfigDict(populate_by_name=True)


class Settings(BaseSettings):
    """进程环境配置。

    @author 称霸幼儿园
    """

    APP_HOST: str = "0.0.0.0"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    APP_VERSION: str = "1.0.0"
    APP_PROFILE: str = "dev"
    DATA_PATH: str = "/tmp/anynote-ai"
    ANYNOTE_INTERNAL_SECRET: SecretStr = SecretStr("anynote-internal-secret-change-in-prod")
    AI_SERVICE_URL: str = "http://anynote-modules-ai:9065"
    NOTE_SERVICE_URL: str = "http://anynote-modules-note:18091"
    FILE_SERVICE_URL: str = "http://anynote-modules-file:8095"
    NOTIFY_SERVICE_URL: str = "http://anynote-modules-notify:9066"
    ES_URL: str = "http://elasticsearch:9200"
    ES_USERNAME: str = ""
    ES_PASSWORD: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_WAKEUP_CHANNEL: str = "anynote:knowledge:change"
    INDEXER_HEALTH_HOST: str = "0.0.0.0"
    INDEXER_HEALTH_PORT: int = 8002
    NACOS_SERVER_ADDRESS: str = ""
    NACOS_NAMESPACE: str = ""
    NACOS_SERVICE_NAME: str = "anynote-ai-harness"
    NACOS_CONFIG_GROUP: str = "DEFAULT_GROUP"
    NACOS_CONFIG_DATA_ID: str = "anynote-ai-harness.yml"
    WHISPER_MODEL: str = "turbo"
    RUN_TERMINAL_TTL_S: float = 300.0

    model_config = ConfigDict(env_file=".env", extra="ignore")

    def runtime_defaults(self) -> RuntimeSettings:
        """返回环境配置的默认运行参数。

        :return: 默认运行配置
        """
        return RuntimeSettings()


class RuntimeConfigStore:
    """以原子替换方式保存最新运行配置。

    @author 称霸幼儿园
    """

    def __init__(self, initial: RuntimeSettings):
        self._current = initial
        self._lock = Lock()

    def get(self) -> RuntimeSettings:
        """返回当前配置快照。

        :return: 当前运行配置
        """
        with self._lock:
            return self._current

    def update(self, value: RuntimeSettings) -> None:
        """替换当前配置快照。

        :param value: 校验后的运行配置
        """
        with self._lock:
            self._current = value


@lru_cache
def get_settings() -> Settings:
    """读取进程环境配置。

    :return: 进程级配置
    """
    return Settings()
