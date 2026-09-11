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
    "MINIO_VERSION": "RELEASE.test",
    "APP_IMAGE_TAG": "release-test",
    "NACOS_NAMESPACE": "production-test",
    "NACOS_PROD_CONFIG_DIR": "/tmp/anynote-test-nacos",
    "NEXT_PUBLIC_APP_URL": "https://notes.example.com",
    "NEXT_PUBLIC_COLLAB_WS_URL": "wss://notes.example.com/collab",
}

def compose(*files, extra=None, success=True):
    # 避免宿主机 .env / IDEA 变量污染测试；只继承执行工具所需变量。
    env = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG"}}
    env.update(extra or {})
    command = ["docker", "compose", "--env-file=/dev/null", "--profile", "*"]
    for file in files:
        command.extend(["-f", f"infra/{file}.yaml"])
    result = subprocess.run(command + ["config", "--format", "json"], cwd=ROOT, env=env, capture_output=True, text=True)
    if not success:
        return result
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)["services"]

class ComposeTest(unittest.TestCase):
    def test_production_only_publishes_frontend_and_collab(self):
        services = compose("docker-compose", "docker-compose.prod", extra=PROD)
        published = {name for name, service in services.items() if service.get("ports")}
        self.assertEqual(published, {"anynote-web", "anynote-collab"})
        for name in published:
            self.assertEqual(services[name]["ports"][0]["host_ip"], "127.0.0.1")
        for name, service in services.items():
            self.assertNotIn("nginx", service.get("image", ""))
            if name != "nacos-init":
                self.assertEqual(service["restart"], "unless-stopped")
        web = services["anynote-web"]
        self.assertNotIn("volumes", web)
        self.assertEqual(web["environment"]["INTERNAL_API_URL"], "http://anynote-gateway:8080")
        for key in ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_COLLAB_WS_URL"]:
            self.assertEqual(web["environment"][key], web["build"]["args"][key])
        collab = services["anynote-collab"]["environment"]
        self.assertEqual(collab["COLLAB_ALLOWED_ORIGINS"], PROD["NEXT_PUBLIC_APP_URL"])
        self.assertEqual(collab["COLLAB_TOKEN_SECRET"], web["environment"]["COLLAB_TOKEN_SECRET"])
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
        hot = compose("docker-compose", "docker-compose.dev", "docker-compose.web-dev")["anynote-web"]
        self.assertEqual(hot["build"]["target"], "development")
        for mount in hot["volumes"]:
            self.assertTrue(mount["read_only"])
            self.assertNotIn("node_modules", mount["target"])
            self.assertNotIn(".next", mount["target"])

    def test_idea_broker_is_reachable_from_host(self):
        services = compose("docker-compose-middleware", "docker-compose.middleware-idea")
        self.assertEqual(services["rocketmq-broker"]["environment"]["ROCKETMQ_BROKER_ADVERTISE_IP"], "127.0.0.1")

if __name__ == "__main__":
    unittest.main()
