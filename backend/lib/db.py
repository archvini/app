"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
        IndexModel([("xp", DESCENDING)], name="xp_desc"),
    ],
    "sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("created_at", ASCENDING)], name="ttl_30d", expireAfterSeconds=60 * 60 * 24 * 30),
    ],
    # links de recuperação de senha: guardamos só o hash do token; somem sozinhos ao expirar
    "password_resets": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="ttl_expires", expireAfterSeconds=0),
    ],
    # fotos de comprovação dos alertas (bytes da imagem); somem junto com o alerta
    "obstacle_photos": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("obstacle_id", ASCENDING)], name="obstacle_id"),
    ],
    # oficinas/borracharias e as avaliações dos ciclistas (uma por pessoa e local)
    "shops": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING)], name="status"),
        IndexModel([("osm_id", ASCENDING)], name="osm_id", unique=True, partialFilterExpression={"osm_id": {"$type": "string"}}),
    ],
    "shop_reviews": [
        IndexModel([("shop_id", ASCENDING), ("user_id", ASCENDING)], name="pair_unique", unique=True),
        IndexModel([("shop_id", ASCENDING), ("created_at", DESCENDING)], name="shop_created"),
    ],
    # quem segue quem: um documento por par (seguidor → seguido)
    "follows": [
        IndexModel([("follower_id", ASCENDING), ("followee_id", ASCENDING)], name="pair_unique", unique=True),
        IndexModel([("followee_id", ASCENDING), ("created_at", DESCENDING)], name="followee_created"),
        IndexModel([("follower_id", ASCENDING), ("created_at", DESCENDING)], name="follower_created"),
    ],
    # notificações do sino (somem sozinhas em 60 dias) e avisos do app para todos
    "notifications": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        IndexModel([("created_at", ASCENDING)], name="ttl_60d", expireAfterSeconds=60 * 60 * 24 * 60),
    ],
    # relatos de problemas do app (equipe lê na Caixa de alertas)
    "bug_reports": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("who", ASCENDING), ("created_at", DESCENDING)], name="who_created"),
    ],
    "announcements": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "rides": [IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created")],
    "obstacles": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("type", ASCENDING)], name="type"),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
    ],
    "bikelanes": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    # chat: mensagens somem sozinhas após 7 dias; encontros, 30 dias depois da data marcada
    "chat_messages": [
        IndexModel([("created_at", ASCENDING)], name="ttl_7d", expireAfterSeconds=60 * 60 * 24 * 7),
        IndexModel([("id", ASCENDING)], name="id", unique=True),
    ],
    "meetups": [
        IndexModel([("starts_at", ASCENDING)], name="ttl_30d_after_start", expireAfterSeconds=60 * 60 * 24 * 30),
        IndexModel([("id", ASCENDING)], name="id", unique=True),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
