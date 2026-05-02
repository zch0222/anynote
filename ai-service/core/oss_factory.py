from core.oss import OSS
from core.config import OSS_TYPE
from core.minio import MinIO

class OSSFactory():

    def __init__(self):
        pass

    def oss() -> OSS:
        if OSS_TYPE == "MINIO":
            return MinIO()
        return None
