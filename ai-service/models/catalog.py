"""逻辑模型目录与运行快照。

@author 称霸幼儿园
"""

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic.alias_generators import to_camel

from core.errors import MODEL_UNAVAILABLE_MESSAGE


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
    """逻辑名到供应商模型的映射。

    @author 称霸幼儿园
    """

    provider: str
    model: str

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ModelCatalogSnapshot(BaseModel):
    """一次运行固定使用的模型目录。

    @author 称霸幼儿园
    """

    version: str
    providers: list[ProviderSnapshot] = Field(default_factory=list)
    logical_models: dict[str, LogicalModelMapping] = Field(default_factory=dict)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def resolve(self, logical_name: str, contains_knowledge: bool) -> tuple[ProviderSnapshot, str]:
        """解析逻辑名并检查启停、模型清单与数据出域标注。

        :param logical_name: 逻辑模型名
        :param contains_knowledge: 本次调用是否包含知识库内容
        :return: 供应商配置与实际模型名
        """
        mapping = self.logical_models.get(logical_name)
        if mapping is None:
            raise ModelConfigurationError()
        provider = next(
            (item for item in self.providers if item.provider_key == mapping.provider),
            None,
        )
        if provider is None or not provider.enabled or mapping.model not in provider.models:
            raise ModelConfigurationError()
        if contains_knowledge and not provider.data_egress_allowed:
            raise ModelConfigurationError()
        if provider.protocol != "openai_compatible":
            raise ModelConfigurationError()
        return provider, mapping.model
