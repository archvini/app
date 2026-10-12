import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes

from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.bikelanes import router as bikelanes_router
from routers.chat import router as chat_router
from routers.moderation import router as moderation_router
from routers.gamification import router as gamification_router
from routers.obstacles import router as obstacles_router
from routers.rides import router as rides_router
from routers.routing import router as routing_router
from routers.social import router as social_router
from routers.shops import router as shops_router
from routers.notifications import router as notifications_router
from routers.bugs import router as bugs_router
from lib.snap import snap_pending_lanes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    # Ajusta ciclovias ainda não "coladas" nas ruas (melhor esforço, em segundo plano, não bloqueia o boot).
    app.state.snap_task = asyncio.create_task(snap_pending_lanes())
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

def _mongo_url_info() -> dict:
    """Resumo SEGURO da MONGO_URL (nunca a senha): ajuda a achar erro de digitação no deploy."""
    from urllib.parse import unquote, urlsplit

    raw = os.environ.get("MONGO_URL", "")
    try:
        parts = urlsplit(raw.strip())
        password = unquote(parts.password or "")
        return {
            "scheme": parts.scheme,
            "user": unquote(parts.username or ""),
            "host": parts.hostname,
            "password_length": len(password),
            "password_has_brackets": "<" in password or ">" in password,
            "url_has_outer_spaces": raw != raw.strip(),
            "db_name": os.environ.get("DB_NAME", ""),
        }
    except Exception as exc:
        return {"parse_error": type(exc).__name__}


@api_router.get("/health")
async def health():
    """Diagnóstico do deploy: responde 200 sempre; `db` diz se o Mongo está acessível (sem expor segredos)."""
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=6)
        return {"ok": True, "db": "up"}
    except Exception as exc:  # o nome do erro basta para saber se é IP bloqueado, senha ou timeout
        logging.getLogger(__name__).error("health: mongo ping falhou: %s", exc)
        out = {"ok": False, "db": "down", "error": type(exc).__name__}
        if os.environ.get("HEALTH_DEBUG") == "1":  # só quando você liga na Vercel; desligue depois
            out["mongo_url"] = _mongo_url_info()
        return out


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# App routers — VaiDeBike Fortaleza
api_router.include_router(auth_router)
api_router.include_router(obstacles_router)
api_router.include_router(bikelanes_router)
api_router.include_router(gamification_router)
api_router.include_router(rides_router)
api_router.include_router(routing_router)
api_router.include_router(admin_router)
api_router.include_router(chat_router)
api_router.include_router(moderation_router)
api_router.include_router(social_router)
api_router.include_router(shops_router)
api_router.include_router(notifications_router)
api_router.include_router(bugs_router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(GZipMiddleware, minimum_size=1000)  # a lista de ciclovias importadas é grande: comprime
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Token"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
