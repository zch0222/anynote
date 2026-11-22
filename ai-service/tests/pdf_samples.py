"""受控 PDF 测试样本生成器。

@author 称霸幼儿园
"""

import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont


def make_pdf_sample(pages: list[dict[str, Any]]) -> bytes:
    """生成带可选文本、实际图片、未使用图片资源、旋转与 CropBox 的 PDF。

    :param pages: 每页的文本、图片和页面属性
    :return: PDF 字节
    """
    image_text = next((str(page["imageText"]) for page in pages if page.get("imageText")), None)
    if image_text is None:
        image = Image.new("RGB", (80, 40), (220, 40, 40))
    else:
        image = Image.new("RGB", (600, 160), "white")
        ImageDraw.Draw(image).text(
            (20, 40),
            image_text,
            fill="black",
            font=ImageFont.load_default(size=48),
        )
    image_buffer = io.BytesIO()
    image.save(image_buffer, format="JPEG")
    image_bytes = image_buffer.getvalue()

    page_ids = [5 + index * 2 for index in range(len(pages))]
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(pages)} >>".encode(),
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        4: (
            f"<< /Type /XObject /Subtype /Image /Width {image.width} /Height {image.height} ".encode()
            + b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            + f"/Length {len(image_bytes)} >>\nstream\n".encode()
            + image_bytes
            + b"\nendstream"
        ),
    }
    for page_id, page in zip(page_ids, pages, strict=True):
        content_id = page_id + 1
        commands: list[str] = []
        text = page.get("text")
        if text:
            escaped = str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"BT /F1 12 Tf 36 160 Td ({escaped}) Tj ET")
        resources = "/Font << /F1 3 0 R >>"
        default_drawings = [(30, 60, 240, 80)] if image_text else [(120, 60, 80, 40)]
        drawings = page.get("images", default_drawings if page.get("image") or page.get("imageText") else [])
        for x, y, width, height in drawings:
            commands.append(f"q {width} 0 0 {height} {x} {y} cm /Im1 Do Q")
        if drawings or page.get("unusedImage"):
            resources += " /XObject << /Im1 4 0 R >>"
        box = f" /CropBox [{' '.join(str(value) for value in page['cropbox'])}]" if page.get("cropbox") else ""
        rotation = f" /Rotate {int(page['rotate'])}" if page.get("rotate") else ""
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200]{box}{rotation} "
            f"/Resources << {resources} >> /Contents {content_id} 0 R >>"
        ).encode()
        stream = " ".join(commands).encode("latin1")
        objects[content_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"
        )

    output = bytearray(b"%PDF-1.4\n")
    offsets = {0: 0}
    for object_id in sorted(objects):
        offsets[object_id] = len(output)
        output.extend(f"{object_id} 0 obj\n".encode())
        output.extend(objects[object_id])
        output.extend(b"\nendobj\n")
    xref = len(output)
    size = max(objects) + 1
    output.extend(f"xref\n0 {size}\n0000000000 65535 f \n".encode())
    for object_id in range(1, size):
        output.extend(f"{offsets[object_id]:010d} 00000 n \n".encode())
    output.extend(
        f"trailer << /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(output)
