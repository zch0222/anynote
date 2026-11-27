"""Compose 合并回归测试：无容器启动、无真实凭据；Linux/WSL + Docker Compose >= 2.24.4。"""
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROD = {
    "JWT_SECRET": "test-only-jwt-secret-32-characters",
    "MYSQL_ROOT_PASSWORD": "test-only-root",
    "MYSQL_APP_PASSWORD": "test-only-app",
    "REDIS_PASSWORD": "test-only-redis",
    "MINIO_ROOT_PASSWORD": "test-only-minio",
    "XXL_JOB_ADMIN_ACCESSTOKEN": "test-only-job",
    "COLLAB_TOKEN_SECRET": "test-only-collab-secret-32-characters",
    "ANYNOTE_INTERNAL_SECRET": "test-only-internal-secret-32-characters",
    "MINIO_VERSION": "RELEASE.test",
    "APP_IMAGE_TAG": "release-test",
    "NACOS_NAMESPACE": "production-test",
    "NACOS_PROD_CONFIG_DIR": "/tmp/anynote-test-nacos",
    "NEXT_PUBLIC_APP_URL": "https://notes.example.com",
    "NEXT_PUBLIC_COLLAB_WS_URL": "wss://notes.example.com/collab",
    "MANAGE_PUBLIC_APP_URL": "https://manage.example.com",
}

def compose(*files, extra=None, success=True):
    # 避免宿主机 .env / IDEA 变量污染测试；只继承执行工具所需变量。
    # USERPROFILE/HOMEDRIVE/HOMEPATH：Windows 下 docker CLI 按 USERPROFILE 发现用户级 compose 插件，
    # 缺失时 `docker compose` 无法调度插件、报 unknown flag（ compose 文件不引用这些变量，不影响插值）。
    env = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"}}
    env.update(extra or {})
    command = ["docker", "compose", f"--env-file={os.devnull}", "--profile", "*"]
    for file in files:
        command.extend(["-f", f"infra/{file}.yaml"])
    result = subprocess.run(command + ["config", "--format", "json"], cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8")
    if not success:
        return result
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)["services"]

class ComposeTest(unittest.TestCase):
    def test_production_only_publishes_frontend_and_collab(self):
        services = compose("docker-compose", "docker-compose.prod", extra=PROD)
        published = {name for name, service in services.items() if service.get("ports")}
        # gateway 自 a42ca340 起按设计保留回环端口（CLI api.YOUR_DOMAIN 反代上游）
        self.assertEqual(published, {"anynote-web", "anynote-collab", "anynote-gateway", "anynote-manage-web"})
        for name in published:
            self.assertEqual(services[name]["ports"][0]["host_ip"], "127.0.0.1")
        for name, service in services.items():
            self.assertNotIn("nginx", service.get("image", ""))
            # *-init 是一次性 ops 容器（如 nacos-init/minio-init），restart 为 "no" 属设计
            if not name.endswith("-init"):
                self.assertEqual(service["restart"], "unless-stopped")
        web = services["anynote-web"]
        self.assertNotIn("volumes", web)
        self.assertEqual(web["environment"]["INTERNAL_API_URL"], "http://anynote-gateway:8080")
        for key in ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_COLLAB_WS_URL"]:
            self.assertEqual(web["environment"][key], web["build"]["args"][key])
        collab = services["anynote-collab"]["environment"]
        self.assertEqual(collab["COLLAB_ALLOWED_ORIGINS"], PROD["NEXT_PUBLIC_APP_URL"])
        self.assertEqual(collab["COLLAB_TOKEN_SECRET"], web["environment"]["COLLAB_TOKEN_SECRET"])
        manage = services["anynote-manage-web"]
        self.assertEqual(manage["environment"]["DEPLOYMENT_ENV"], "production")
        self.assertEqual(manage["environment"]["NUXT_INTERNAL_API_URL"], "http://anynote-gateway:8080")
        self.assertEqual(
            manage["environment"]["NUXT_PUBLIC_APP_URL"],
            manage["build"]["args"]["NUXT_PUBLIC_APP_URL"],
        )
        self.assertEqual(manage["ports"][0]["host_ip"], "127.0.0.1")
        gateway = services["anynote-gateway"]["environment"]
        self.assertIn("application-prod.yml", gateway["SPRING_CONFIG_IMPORT"])
        self.assertNotIn("application-dev.yml", gateway["SPRING_CONFIG_IMPORT"])
        self.assertEqual(gateway["SERVER_PORT"], "8080")
        self.assertEqual(services["nacos-init"]["profiles"], ["ops"])

    def test_missing_production_settings_fail_before_start(self):
        for key in PROD:
            with self.subTest(key=key):
                env = dict(PROD)
                env.pop(key)
                result = compose("docker-compose", "docker-compose.prod", extra=env, success=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(key, result.stderr)

    def test_dev_image_and_hot_reload_do_not_share_host_builds(self):
        services = compose("docker-compose", "docker-compose.dev")
        web = services["anynote-web"]
        self.assertEqual(web["environment"]["DEPLOYMENT_ENV"], "development")
        self.assertEqual(web["restart"], "no")
        self.assertEqual(web["build"]["target"], "runtime")
        self.assertTrue(services["anynote-gateway"]["ports"])
        manage = services["anynote-manage-web"]
        self.assertEqual(manage["environment"]["DEPLOYMENT_ENV"], "development")
        self.assertEqual(manage["restart"], "no")
        self.assertEqual(manage["environment"]["NUXT_PUBLIC_APP_URL"], "http://localhost:3080")
        hot = compose("docker-compose", "docker-compose.dev", "docker-compose.web-dev")["anynote-web"]
        self.assertEqual(hot["build"]["target"], "development")
        for mount in hot["volumes"]:
            self.assertTrue(mount["read_only"])
            self.assertNotIn("node_modules", mount["target"])
            self.assertNotIn(".next", mount["target"])

    def test_idea_broker_is_reachable_from_host(self):
        services = compose("docker-compose-middleware", "docker-compose.middleware-idea")
        self.assertEqual(services["rocketmq-broker"]["environment"]["ROCKETMQ_BROKER_ADVERTISE_IP"], "127.0.0.1")

    def test_ai_python_runtime_isolated_and_whisper_optional(self):
        """验证在线镜像目标、只读文件系统、Whisper 可选性与生产端口边界。"""
        dev = compose("docker-compose", "docker-compose.dev")
        self.assertEqual(dev["anynote-ai-harness"]["build"]["target"], "online")
        self.assertTrue(dev["anynote-ai-harness"]["read_only"])
        self.assertEqual(dev["anynote-ai-harness"]["restart"], "no")
        self.assertEqual(dev["anynote-ai-whisper"]["build"]["target"], "whisper")
        self.assertEqual(dev["anynote-ai-whisper"]["profiles"], ["whisper"])
        self.assertEqual(
            dev["anynote-ai-whisper"]["environment"]["NACOS_SERVICE_NAME"],
            "anynote-ai-whisper",
        )
        prod = compose("docker-compose", "docker-compose.prod", extra=PROD)
        self.assertFalse(prod["anynote-ai-harness"].get("ports"))
        self.assertFalse(prod["anynote-ai-whisper"].get("ports"))
        self.assertEqual(prod["anynote-ai-harness"]["environment"]["APP_PROFILE"], "prod")

    def test_ai_indexer_worker_isolated_without_published_ports(self):
        """验证索引 Worker 使用 indexer 镜像、最小权限只读且不对外暴露端口。"""
        dev = compose("docker-compose", "docker-compose.dev")
        indexer = dev["anynote-ai-indexer"]
        self.assertEqual(indexer["build"]["target"], "indexer")
        self.assertTrue(indexer["read_only"])
        self.assertIn("no-new-privileges:true", indexer["security_opt"])
        self.assertEqual(indexer["cap_drop"], ["ALL"])
        self.assertEqual(indexer["restart"], "no")
        self.assertFalse(indexer.get("ports"))
        self.assertEqual(indexer["environment"]["NACOS_SERVICE_NAME"], "anynote-ai-indexer")
        self.assertEqual(indexer["environment"]["NACOS_CONFIG_DATA_ID"], "anynote-ai-indexer.yml")
        self.assertEqual(indexer["environment"]["REDIS_WAKEUP_CHANNEL"], "anynote:knowledge:change")

        prod = compose("docker-compose", "docker-compose.prod", extra=PROD)
        self.assertFalse(prod["anynote-ai-indexer"].get("ports"))
        self.assertEqual(prod["anynote-ai-indexer"]["environment"]["APP_PROFILE"], "prod")
        self.assertEqual(
            prod["anynote-ai-indexer"]["environment"]["NACOS_SERVICE_NAME"],
            "anynote-ai-indexer",
        )


if __name__ == "__main__":
    unittest.main()
