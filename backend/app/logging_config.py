from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

from app.config import PROJECT_ROOT


def configure_logging(level: int = logging.INFO) -> logging.Logger:
    """Configura logging estruturado para console e arquivo rotativo quando gravável."""
    root_logger = logging.getLogger("radar_legislativo")
    if root_logger.handlers:
        return root_logger

    root_logger.setLevel(level)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)

    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("VERCEL_ENV")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    )
    if not is_serverless:
        try:
            log_dir = PROJECT_ROOT / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / "radar_legislativo.log"
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=2_000_000,
                backupCount=3,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)
        except OSError:
            # Em ambientes com filesystem somente leitura, mantém apenas StreamHandler.
            pass

    return root_logger
