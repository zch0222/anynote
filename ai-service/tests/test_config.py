"""运行配置单元测试。

@author 称霸幼儿园
"""

from core.config import HarnessRuntimeSettings


def test_prefetch_setting_is_disabled_by_default_and_reads_kebab_case():
    """预取运行配置默认关闭，并支持 Nacos 的 kebab-case 字段。"""
    assert HarnessRuntimeSettings().prefetch_enabled is False
    assert HarnessRuntimeSettings.model_validate({"prefetch-enabled": True}).prefetch_enabled is True
