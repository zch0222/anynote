from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    ORIGINS: str = ""
    DATA_PATH: str = ""
    OPENAI_API_BASE: str = ""
    OPENAI_API_KEY: str = ""
    RAG_LLM_MODEL: str = ""
    HOST: str = ""
    APP_HOST: str = "0.0.0.0"
    PORT: int = 8000
    RAG_EMBEDDING_MODEL: str = ""
    BASE_PROMPT: str = ""
    GITHUB_TOKEN: str = ""
    CODE_EMBEDDING_MODEL: str = ""
    WHISPER_MODEL: str = ""

    DEEP_SEEK_URL: str = ""
    DEEP_SEEK_API_KEY: str = ""

    # OSS配置
    OSS_TYPE: str = ""

    # MinIO
    MINIO_ADDRESS: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = ""
    MINIO_BAST_PATH: str = ""

    ROCKETMQ_TOPIC: str = ""
    ROCKETMQ_NAMESERVER_ADDRESS: str = ""
    ROCKETMQ_ACCESS_KEY: str = ""
    ROCKETMQ_ACCESS_SECRET: str = ""
    HTTP_PROXY: str = ""
    HTTPS_PROXY: str = ""
    TOKEN: str = ""

    # Nacos相关的配置
    NACOS_SERVER_ADDRESS: str = ""
    NACOS_SERVER_PORT: str = ""
    NACOS_NAMESPACE: str = ""
    NACOS_SERVICE_NAME: str = ""

    model_config = ConfigDict(env_file=".env", extra="ignore")


_settings = Settings()

# 向后兼容的模块级变量（供已有代码直接 import 使用）
ORIGINS = _settings.ORIGINS.split(",") if _settings.ORIGINS else []
DATA_PATH = _settings.DATA_PATH
OPENAI_API_BASE = _settings.OPENAI_API_BASE
OPENAI_API_KEY = _settings.OPENAI_API_KEY
RAG_LLM_MODEL = _settings.RAG_LLM_MODEL
HOST = _settings.HOST
APP_HOST = _settings.APP_HOST
PORT = _settings.PORT
RAG_EMBEDDING_MODEL = _settings.RAG_EMBEDDING_MODEL
BASE_PROMPT = _settings.BASE_PROMPT
GITHUB_TOKEN = _settings.GITHUB_TOKEN
CODE_EMBEDDING_MODEL = _settings.CODE_EMBEDDING_MODEL
WHISPER_MODEL = _settings.WHISPER_MODEL

DEEP_SEEK_URL = _settings.DEEP_SEEK_URL
DEEP_SEEK_API_KEY = _settings.DEEP_SEEK_API_KEY

OSS_TYPE = _settings.OSS_TYPE

MINIO_ADDRESS = _settings.MINIO_ADDRESS
MINIO_ACCESS_KEY = _settings.MINIO_ACCESS_KEY
MINIO_SECRET_KEY = _settings.MINIO_SECRET_KEY
MINIO_BUCKET = _settings.MINIO_BUCKET
MINIO_BAST_PATH = _settings.MINIO_BAST_PATH

ROCKETMQ_TOPIC = _settings.ROCKETMQ_TOPIC
ROCKETMQ_NAMESERVER_ADDRESS = _settings.ROCKETMQ_NAMESERVER_ADDRESS
ROCKETMQ_ACCESS_KEY = _settings.ROCKETMQ_ACCESS_KEY
ROCKETMQ_ACCESS_SECRET = _settings.ROCKETMQ_ACCESS_SECRET
HTTP_PROXY = _settings.HTTP_PROXY
HTTPS_PROXY = _settings.HTTPS_PROXY
TOKEN = _settings.TOKEN

NACOS_SERVER_ADDRESS = _settings.NACOS_SERVER_ADDRESS
NACOS_SERVER_PORT = _settings.NACOS_SERVER_PORT
NACOS_NAMESPACE = _settings.NACOS_NAMESPACE
NACOS_SERVICE_NAME = _settings.NACOS_SERVICE_NAME
