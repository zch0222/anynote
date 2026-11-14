"""API 错误模型。

@author 称霸幼儿园
"""


class ApiError(Exception):
    """携带统一响应码的 API 异常。

    @author 称霸幼儿园
    """

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


MISSING_USER_MESSAGE = "没有设置用户信息，不允许访问"
INVALID_SOURCE_MESSAGE = "没有内部访问权限，不允许访问"
INVALID_SIGNATURE_MESSAGE = "内部调用签名验证失败"
INVALID_INPUT_MESSAGE = "请求参数错误"
RUN_NOT_FOUND_MESSAGE = "运行不存在"
MODEL_UNAVAILABLE_MESSAGE = "模型服务暂时不可用，请稍后重试"
MODEL_TIMEOUT_MESSAGE = "模型调用超时，请稍后重试"
BUDGET_EXHAUSTED_MESSAGE = "本次运行已达到处理上限"
RUN_CANCELLED_MESSAGE = "运行已取消"
INTERNAL_ERROR_MESSAGE = "服务暂时不可用，请稍后重试"
