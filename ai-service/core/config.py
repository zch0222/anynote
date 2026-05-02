from dotenv import load_dotenv
import os

load_dotenv()

ORIGINS = os.environ.get("ORIGINS").split(",")
DATA_PATH = os.environ.get("DATA_PATH")
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
RAG_LLM_MODEL = os.environ.get("RAG_LLM_MODEL")
HOST = os.environ.get("HOST")
APP_HOST = os.environ.get("APP_HOST")
PORT = int(os.environ.get("PORT"))
RAG_EMBEDDING_MODEL = os.environ.get("RAG_EMBEDDING_MODEL")
BASE_PROMPT = os.environ.get("BASE_PROMPT")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
CODE_EMBEDDING_MODEL = os.environ.get("CODE_EMBEDDING_MODEL")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL")

DEEP_SEEK_URL = os.environ.get("DEEP_SEEK_URL")
DEEP_SEEK_API_KEY = os.environ.get("DEEP_SEEK_API_KEY")

# OSS配置
OSS_TYPE = os.environ.get("OSS_TYPE")

# MinIO
MINIO_ADDRESS = os.environ.get("MINIO_ADDRESS")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET")
MINIO_BAST_PATH = os.environ.get("MINIO_BAST_PATH")

ROCKETMQ_TOPIC = os.environ.get("ROCKETMQ_TOPIC")
ROCKETMQ_NAMESERVER_ADDRESS = os.environ.get("ROCKETMQ_NAMESERVER_ADDRESS")
ROCKETMQ_ACCESS_KEY = os.environ.get("ROCKETMQ_ACCESS_KEY")
ROCKETMQ_ACCESS_SECRET = os.environ.get("ROCKETMQ_ACCESS_SECRET")
HTTP_PROXY = os.environ.get("http_proxy")
HTTPS_PROXY = os.environ.get("https_proxy")
TOKEN = os.environ.get("TOKEN")
# Nacos相关的配置
NACOS_SERVER_ADDRESS = os.environ.get("NACOS_SERVER_ADDRESS")
NACOS_SERVER_PORT = os.environ.get("NACOS_SERVER_PORT")
NACOS_NAMESPACE = os.environ.get("NACOS_NAMESPACE")

NACOS_SERVICE_NAME = os.environ.get("NACOS_SERVICE_NAME")
# NACOS_SERVICE_IP = os.environ.get("NACOS_SERVICE_IP")
# NACOS_SERVICE_PORT = os.environ.get("NACOS_SERVER_PORT")

