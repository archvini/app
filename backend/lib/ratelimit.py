"""Limite de tentativas por IP/conta, guardado no Mongo (funciona entre as várias instâncias da Vercel).

Cada tentativa vira um registro que some sozinho em 1 hora (índice TTL em lib/db.py). Quem passa do limite recebe 429.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from lib.db import db


def client_ip(request: Request) -> str:
    """IP de quem chamou. Atrás da Vercel o x-real-ip / x-forwarded-for vêm dela (o cliente não escolhe)."""
    ip = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return ip or (request.client.host if request.client else "?")


async def too_many(key: str, limit: int, window_s: int) -> bool:
    since = datetime.now(timezone.utc) - timedelta(seconds=window_s)
    return await db.rate_hits.count_documents({"key": key, "at": {"$gt": since}}) >= limit


async def record(key: str) -> None:
    await db.rate_hits.insert_one({"key": key, "at": datetime.now(timezone.utc)})


async def hit(key: str, limit: int, window_s: int, detail: str = "Muitas tentativas. Aguarde um pouco e tente de novo.") -> None:
    """Conta uma tentativa; se já passou do limite na janela, responde 429."""
    if await too_many(key, limit, window_s):
        raise HTTPException(status_code=429, detail=detail)
    await record(key)
