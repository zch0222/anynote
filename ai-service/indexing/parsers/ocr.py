"""RapidOCR 本地识别适配与行排序。

@author 称霸幼儿园
"""

from dataclasses import dataclass
from typing import Any


class OcrEngineError(RuntimeError):
    """本地 OCR 引擎初始化或识别失败。

    @author 称霸幼儿园
    """


@dataclass(slots=True)
class OcrLine:
    """一行 OCR 文本及其在输入图像中的像素边界框。

    @author 称霸幼儿园
    """

    text: str
    bbox: tuple[float, float, float, float]


class RapidOCREngine:
    """封装随 Python 包离线提供的 RapidOCR ONNX 模型。

    @author 称霸幼儿园
    """

    def __init__(self):
        try:
            from rapidocr_onnxruntime import RapidOCR

            self._engine = RapidOCR(
                intra_op_num_threads=4,
                inter_op_num_threads=2,
            )
        except Exception as error:
            raise OcrEngineError(type(error).__name__) from error

    def recognize(self, image: bytes) -> list[OcrLine]:
        """识别一张图像并按纵坐标、横坐标返回有效文字行。

        :param image: JPEG 图像字节
        :return: 阅读顺序排列的 OCR 行
        """
        try:
            result, _elapsed = self._engine(image)
        except Exception as error:
            raise OcrEngineError(type(error).__name__) from error
        return normalize_ocr_result(result)


def normalize_ocr_result(result: Any) -> list[OcrLine]:
    """将 RapidOCR 响应转换为稳定的行模型并过滤空文本。

    :param result: RapidOCR 原始识别结果
    :return: 排序后的 OCR 行
    """
    lines: list[OcrLine] = []
    for item in result or []:
        try:
            points, text = item[0], str(item[1]).strip()
            if not text or len(points) < 4:
                continue
            xs = [float(point[0]) for point in points]
            ys = [float(point[1]) for point in points]
            bbox = (min(xs), min(ys), max(xs), max(ys))
            if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
                continue
            lines.append(OcrLine(text=text, bbox=bbox))
        except (TypeError, ValueError, IndexError) as error:
            raise OcrEngineError("invalid OCR response") from error
    lines.sort(key=lambda line: (line.bbox[1], line.bbox[0]))
    return lines
