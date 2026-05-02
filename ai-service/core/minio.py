from minio import Minio
from minio.error import S3Error
from core.oss import OSS
from core.config import MINIO_BUCKET, MINIO_ADDRESS, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BAST_PATH
from core.logger import get_logger

class MinIO(OSS):

    def get_minio_client(self) -> Minio:
        return Minio(MINIO_ADDRESS, 
                     access_key=MINIO_ACCESS_KEY,
                     secret_key=MINIO_SECRET_KEY)

    def __init__(self):
        self.logger = get_logger()
        self.minio = self.get_minio_client()

    def put_object(self, object_name: str, object):
        result = self.minio.put_object(MINIO_BUCKET, f"{MINIO_BAST_PATH}/{object_name}", object, 5)
        self.logger.info(
            "created {0} object; etag: {1}, version-id: {2}".format(
                result.object_name, result.etag, result.version_id,
            ),
        )
    
    def get_object(self, object_name: str) -> bytes:
        try:
            response = self.minio.get_object(MINIO_BUCKET, f"{MINIO_BAST_PATH}/{object_name}")
            return response.read()
        finally:
            response.close()
            response.release_conn()
