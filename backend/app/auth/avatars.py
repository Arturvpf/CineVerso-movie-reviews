"""Valida e reencoda fotos, descartando metadados e conteúdo adicional."""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_AVATAR_PIXELS = 16_000_000
MAX_AVATAR_SIDE = 8192


def prepare_avatar(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data), formats=("PNG", "JPEG", "WEBP")) as source:
            width, height = source.size
            if max(width, height) > MAX_AVATAR_SIDE or width * height > MAX_AVATAR_PIXELS:
                raise ValueError("A imagem deve ter até 16 megapixels e 8192 pixels por lado.")
            source.verify()
        with Image.open(BytesIO(data), formats=("PNG", "JPEG", "WEBP")) as source:
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGBA")
            image.thumbnail((512, 512))
            image.info.clear()
            output = BytesIO()
            image.save(output, format="PNG")
            return output.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValueError("Envie uma imagem PNG, JPEG ou WebP válida.") from exc
