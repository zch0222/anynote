from time import sleep

import nacos
from core.config import NACOS_SERVER_ADDRESS, NACOS_SERVER_PORT, NACOS_NAMESPACE, NACOS_SERVICE_NAME, HOST, PORT
from core.logger import get_logger

class NacosClient:

    def __init__(self):
        self.nacos_server_address = NACOS_SERVER_ADDRESS
        self.nacos_server_port = NACOS_SERVER_PORT
        self.nacos_namespace = NACOS_NAMESPACE
        self.nacos_service_name = NACOS_SERVICE_NAME
        self.logger = get_logger()
        self.nacos_client = nacos.NacosClient(server_addresses=self.nacos_server_address,
                                              namespace=self.nacos_namespace)


    def register(self):
        self.nacos_client.add_naming_instance(self.nacos_service_name, HOST, PORT)

    async def sent_heartbeat(self):
        res = self.nacos_client.send_heartbeat(self.nacos_service_name, HOST, PORT)
        # self.logger.info(str(res))

