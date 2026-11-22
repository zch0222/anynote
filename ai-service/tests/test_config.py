"""运行配置单元测试。

@author 称霸幼儿园
"""

from core.config import HarnessRuntimeSettings, IndexerRuntimeSettings


def test_prefetch_setting_is_disabled_by_default_and_reads_kebab_case():
    """预取运行配置默认关闭，并支持 Nacos 的 kebab-case 字段。"""
    assert HarnessRuntimeSettings().prefetch_enabled is False
    assert HarnessRuntimeSettings.model_validate({"prefetch-enabled": True}).prefetch_enabled is True


def test_ocr_settings_default_disabled_and_read_nacos_names():
    """OCR 默认关闭，并读取方案确定的 Nacos 热更新参数。"""
    settings = IndexerRuntimeSettings.model_validate({
        "ocr-enabled": True,
        "ocr-timeout-s": 120,
        "ocr-max-memory-mb": 2048,
        "ocr-max-pages": 200,
        "ocr-max-regions-per-page": 100,
        "ocr-render-scale": 2.0,
    })
    assert IndexerRuntimeSettings().ocr_enabled is False
    assert settings.ocr_enabled is True
    assert (settings.ocr_timeout_s, settings.ocr_max_memory_mb, settings.ocr_max_pages) == (120, 2048, 200)
    assert (settings.ocr_max_regions_per_page, settings.ocr_render_scale) == (100, 2.0)


def test_visual_settings_default_disabled_and_read_nacos_names():
    """视觉读取默认关闭，并读取页数、渲染、字节和图片预算参数。"""
    settings = HarnessRuntimeSettings.model_validate({
        "visual-read-enabled": True,
        "visual-max-pages-per-call": 2,
        "visual-max-pages-per-run": 4,
        "visual-max-pdf-bytes": 52428800,
        "visual-render-concurrency": 2,
        "visual-render-timeout-s": 20,
        "visual-render-max-memory-mb": 512,
        "visual-image-max-bytes": 1572864,
        "visual-image-token-estimate": 2000,
    })
    assert HarnessRuntimeSettings().visual_read_enabled is False
    assert settings.visual_read_enabled is True
    assert (settings.visual_max_pages_per_call, settings.visual_max_pages_per_run) == (2, 4)
    assert (settings.visual_max_pdf_bytes, settings.visual_render_concurrency) == (52428800, 2)
    assert (settings.visual_render_timeout_s, settings.visual_render_max_memory_mb) == (20, 512)
    assert (settings.visual_image_max_bytes, settings.visual_image_token_estimate) == (1572864, 2000)
