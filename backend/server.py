import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import os
import logging
from pathlib import Path


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


@api_router.get("/health")
async def health():
    """Diagnóstico do deploy: `db` diz se o Mongo está acessível. Não revela nada sobre a configuração."""
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=6)
        return {"ok": True, "db": "up"}
    except Exception as exc:  # o detalhe vai só para o log do servidor
        logging.getLogger(__name__).error("health: mongo ping falhou: %s", exc)
        return {"ok": False, "db": "down"}


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
# Sem CORS_ORIGINS só o desenvolvimento local fala com a API de outra origem. Nunca "*" com cookies: qualquer site poderia agir como o usuário.
_DEV_ORIGINS = "http://localhost:5173,http://localhost:3000"
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", _DEV_ORIGINS).split(",") if o.strip() and o.strip() != "*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Session-Token"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Cabeçalhos de segurança em toda resposta da API (a respostas de erro também)."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    private = ("/api/auth", "/api/social", "/api/notifications", "/api/rides", "/api/chat", "/api/bugs", "/api/moderation")
    if request.url.path.startswith(private) and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"  # dados pessoais nunca ficam em cache
    return response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
