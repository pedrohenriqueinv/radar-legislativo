from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExecucaoColeta

ARCHIVE_PREFIX = "https://www.camara.leg.br/cotas/Ano-"
ARCHIVE_INDEX = "https://dadosabertos.camara.leg.br/swagger/api.html#arquivos"


def archive_url(year: int) -> str:
    return f"{ARCHIVE_PREFIX}{year}.csv.zip"


def has_archive_cut(session: Session, uf: str, year: int) -> bool:
    return session.scalar(select(ExecucaoColeta.id).where(
        ExecucaoColeta.uf == uf,
        ExecucaoColeta.ano == year,
        ExecucaoColeta.origem_api == archive_url(year),
    ).limit(1)) is not None


ARCHIVE_REFRESH_MESSAGE = (
    "Este recorte vem do arquivo anual oficial da CEAP. "
    "A atualização deve ser feita por importação do arquivo, para evitar despesas duplicadas."
)
