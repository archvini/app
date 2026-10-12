"""Reports de problemas do app (diferentes dos alertas do mapa): o usuário descreve, a equipe analisa na Caixa de alertas."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from lib.auth import get_current_user, require_moderator
from lib.dates import utc_aware
from lib.db import db
from lib.notify import notify

router = APIRouter(prefix="/bugs", tags=["bugs"])

Category = Literal["travou", "erro", "visual", "sugestao", "outro"]
Status = Literal["novo", "analisando", "resolvido"]
MAX_PER_HOUR = 5  # evita spam (inclusive de quem não está logado)


class BugCreate(BaseModel):
    category: Category = "erro"
    message: str = Field(min_length=10, max_length=1000)
    # contexto coletado pelo app para ajudar a reproduzir o problema
    page: str = Field(default="", max_length=200)
    user_agent: str = Field(default="", max_length=300)
    viewport: str = Field(default="", max_length=30)
    app_version: str = Field(default="", max_length=40)


class BugItem(BaseModel):
    id: str
    category: Category
    message: str
    status: Status
    user_id: str | None = None
    user_name: str | None = None
    page: str = ""
    user_agent: str = ""
    viewport: str = ""
    app_version: str = ""
    created_at: datetime


class BugStatus(BaseModel):
    status: Status


def _who(request: Request, user: dict | None) -> str:
    if user:
        return user["id"]
    fwd = request.headers.get("x-forwarded-for", "")
    return "ip:" + (fwd.split(",")[0].strip() or (request.client.host if request.client else "?"))


@router.post("")
async def create_bug(body: BugCreate, request: Request, user: dict | None = Depends(get_current_user)):
    who = _who(request, user)
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    if await db.bug_reports.count_documents({"who": who, "created_at": {"$gt": since}}) >= MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="Você já enviou vários relatos agora. Tente de novo daqui a pouco.")
    doc = {
        "id": uuid.uuid4().hex,
        **body.model_dump(),
        "status": "novo",
        "who": who,
        "user_id": user["id"] if user else None,
        "user_name": user["name"] if user else None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.bug_reports.insert_one(doc)
    return {"ok": True}


@router.get("", response_model=list[BugItem])
async def list_bugs(status: str = "abertos", _mod: dict = Depends(require_moderator)):
    q = {"status": {"$ne": "resolvido"}} if status == "abertos" else {"status": status}
    docs = await db.bug_reports.find(q).sort("created_at", -1).to_list(100)
    return [BugItem(**{**d, "created_at": utc_aware(d["created_at"])}) for d in docs]


@router.get("/open-count")
async def open_count(_mod: dict = Depends(require_moderator)):
    return {"open": await db.bug_reports.count_documents({"status": {"$ne": "resolvido"}})}


@router.patch("/{bug_id}")
async def set_status(bug_id: str, body: BugStatus, _mod: dict = Depends(require_moderator)):
    doc = await db.bug_reports.find_one_and_update({"id": bug_id}, {"$set": {"status": body.status}})
    if not doc:
        raise HTTPException(status_code=404, detail="Relato não encontrado")
    if body.status == "resolvido" and doc.get("status") != "resolvido" and doc.get("user_id"):
        await notify(doc["user_id"], "bug_fixed", "Obrigado por avisar! Corrigimos um problema que você relatou.", doc["message"][:100])
    return {"ok": True}
