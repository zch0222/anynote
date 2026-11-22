"""逻辑模型目录与运行快照。

@author 称霸幼儿园
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from pydantic.alias_generators import to_camel

from core.errors import MODEL_UNAVAILABLE_MESSAGE
from retrieval.settings import RetrievalSettings


class ModelError(RuntimeError):
    """模型接入错误基类。"""

    category = "MODEL_UNAVAILABLE"
    retryable = False

    def __init__(self, message: str = MODEL_UNAVAILABLE_MESSAGE):
        super().__init__(message)
        self.message = message


class ModelConfigurationError(ModelError):
    """逻辑模型或供应商配置不可用。"""


class ProviderSnapshot(BaseModel):
    """单个供应商的运行时配置。

    @author 称霸幼儿园
    """

    provider_key: str
    display_name: str
    protocol: str
    base_url: str
    api_key: SecretStr
    models: list[str] = Field(default_factory=list)
    data_egress_allowed: bool = False
    enabled: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LogicalModelMapping(BaseModel):
    """逻辑名到供应商模型的映射，唯一来源是 Java 快照（数据库 a_logical_model）。

    @author 称霸幼儿园
    """

    provider: str = ""
    model: str = ""
    enabled: bool | None = None
    dimensions: int | None = None
    reasoning_format: Literal["none", "reasoning_content", "reasoning", "think_tag"] = "none"
    reasoning_passthrough: Literal["none", "empty", "original"] = "none"
    supports_vision: bool = False

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ModelCatalogSnapshot(BaseModel):
    """一次运行固定使用的模型目录。

    @author 称霸幼儿园
    """

    version: str
    providers: list[ProviderSnapshot] = Field(default_factory=list)
    logical_models: dict[str, LogicalModelMapping] = Field(default_factory=dict)
    retrieval: RetrievalSettings = Field(default_factory=RetrievalSettings)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("retrieval", mode="before")
    @classmethod
    def _default_retrieval(cls, value: Any) -> Any:
        return {} if value is None else value

    def resolve(
        self,
        logical_name: str,
        contains_knowledge: bool,
        require_listed_model: bool = True,
    ) -> tuple[ProviderSnapshot, str]:
        """解析逻辑名并检查启停、模型清单与数据出域标注。

        :param logical_name: 逻辑模型名
        :param contains_knowledge: 本次调用是否包含知识库内容
        :param require_listed_model: 是否要求模型名在供应商预声明列表中
        :return: 供应商配置与实际模型名
        """
        mapping = self.logical_models.get(logical_name)
        if mapping is None or mapping.enabled is False:
            raise ModelConfigurationError()
        provider = next(
            (item for item in self.providers if item.provider_key == mapping.provider),
            None,
        )
        if provider is None or not provider.enabled or not mapping.model.strip():
            raise ModelConfigurationError()
        if require_listed_model and mapping.model not in provider.models:
            raise ModelConfigurationError()
        if contains_knowledge and not provider.data_egress_allowed:
            if logical_name == "embedding":
                raise ModelConfigurationError("模型供应商未允许数据出境，拒绝发送知识内容进行向量化")
            raise ModelConfigurationError()
        if provider.protocol != "openai_compatible":
            raise ModelConfigurationError()
        return provider, mapping.model.strip()

    def resolve_embedding(self) -> tuple[ProviderSnapshot, str, int | None] | None:
        """解析 Embedding 运行时逻辑模型配置。

        :return: 启用时返回（供应商, 模型名, 指定维度），关闭或未配置时返回 None
        """
        mapping = self.logical_models.get("embedding")
        if mapping is None or mapping.enabled is False:
            return None
        if mapping.enabled is None and (not mapping.provider.strip() or not mapping.model.strip()):
            return None
        provider, model = self.resolve("embedding", True, require_listed_model=False)
        return provider, model, mapping.dimensions
