import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    burn_password_check,
    session_key,
    token_from,
    end_session,
    get_current_user,
    hash_password,
    pwd_needs_update,
    start_session,
    verify_password,
)
from lib.db import db
from lib.ratelimit import client_ip, hit, record, too_many
from lib.game import apply_badges, level_for_xp, user_from_doc
from lib.mailer import mail_enabled, reset_email, send_mail
from models.user import AccountDelete, Deactivate, EmailChange, ForgotPassword, ResetPassword, LoginRequest, OnboardingUpdate, PasswordChange, ProfileUpdate, RegisterRequest, User

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

RESET_TTL = timedelta(hours=1)
RESET_MAX_PER_HOUR = 3


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _app_url() -> str:
    """Endereço do SITE (nunca vem do pedido: um Host/Origin forjado poderia mandar o link para um site falso)."""
    url = os.environ.get("APP_URL", "").strip().rstrip("/")
    if url:
        return url
    for origin in os.environ.get("CORS_ORIGINS", "").split(","):
        origin = origin.strip().rstrip("/")
        if origin.startswith("https://"):
            return origin
    return ""


@router.post("/register", response_model=User)
async def register(req: RegisterRequest, request: Request, response: Response):
    await hit(f"register:{client_ip(request)}", 10, 3600, "Muitos cadastros deste aparelho. Tente de novo mais tarde.")
    email = req.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "email": email,
        "bio": "",
        "bike_type": req.bike_type or "urbana",
        "avatar": "",
        "onboarded": False,
        "city": "Fortaleza",
        "xp": 0,
        "level": 1,
        "total_km": 0.0,
        "reports_count": 0,
        "confirms_count": 0,
        "badge_ids": [],
        "password_hash": hash_password(req.password),
        "password_changed": True,  # a própria pessoa escolheu a senha
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    doc, _ = await apply_badges(doc)  # emblema "Calouro do Pedal" vem de graça no cadastro
    await start_session(response, doc["id"])
    return user_from_doc(doc)


@router.post("/login", response_model=User)
async def login(req: LoginRequest, request: Request, response: Response):
    email = req.email.lower()
    ip_key, mail_key = f"login-ip:{client_ip(request)}", f"login-mail:{email}"
    # só as tentativas ERRADAS contam: 20 por IP e 8 por conta a cada 15 minutos (trava força bruta e troca de senhas vazadas)
    if await too_many(ip_key, 20, 900) or await too_many(mail_key, 8, 900):
        raise HTTPException(status_code=429, detail="Muitas tentativas de entrada. Aguarde 15 minutos ou use \"Esqueci a senha\".")
    user = await db.users.find_one({"email": email})
    # contas de demonstração têm senha pública: só entram em desenvolvimento (ALLOW_DEMO_LOGIN=1)
    demo_blocked = bool(user) and str(user.get("id", "")).startswith("seed-") and os.environ.get("ALLOW_DEMO_LOGIN") != "1"
    if not user or demo_blocked:
        burn_password_check(req.password)
        await record(ip_key)
        await record(mail_key)
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not verify_password(req.password, user["password_hash"]):
        await record(ip_key)
        await record(mail_key)
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if pwd_needs_update(user["password_hash"]):  # senha antiga com poucas voltas: refaz com a força atual
        await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(req.password)}})
    if user.get("deactivated"):  # entrar de novo reativa a conta desativada
        await db.users.update_one({"id": user["id"]}, {"$set": {"deactivated": False}})
        user["deactivated"] = False
    await start_session(response, user["id"])
    return user_from_doc(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    await end_session(request, response)
    return {"ok": True}


@router.get("/me", response_model=User | None)
async def me(user: dict | None = Depends(get_current_user)):
    """200 com `null` para visitantes — a página inicial não deve encher o console de 401s."""
    return user_from_doc(user) if user else None


@router.put("/me", response_model=User)
async def update_me(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    updates: dict = {}
    if req.name is not None and req.name.strip():
        updates["name"] = req.name.strip()
    if req.bio is not None:
        updates["bio"] = req.bio.strip()[:280]
    if req.bike_type is not None:
        updates["bike_type"] = req.bike_type
    if req.avatar is not None:
        updates["avatar"] = req.avatar
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]})
    return user_from_doc(fresh)


@router.post("/password")
async def change_password(req: PasswordChange, request: Request, user: dict = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="A senha atual está incorreta")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(req.new_password), "password_changed": True}},
    )
    # encerra os outros aparelhos; esta sessão continua ativa
    await db.sessions.delete_many({"user_id": user["id"], "token": {"$ne": session_key(token_from(request) or "")}})
    return {"ok": True}


@router.post("/email")
async def change_email(req: EmailChange, user: dict = Depends(get_current_user)):
    """Troca o e-mail de login. Exige a senha atual; não aceita um e-mail que já tem conta."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="A senha está incorreta")
    new = req.new_email.lower()
    if new == user["email"]:
        raise HTTPException(status_code=400, detail="Este já é o seu e-mail")
    if await db.users.find_one({"email": new}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    try:
        await db.users.update_one({"id": user["id"]}, {"$set": {"email": new}})
    except Exception:  # corrida com outro cadastro: o índice único barra
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    await db.password_resets.delete_many({"user_id": user["id"]})  # links pendentes eram do e-mail antigo
    return user_from_doc(await db.users.find_one({"id": user["id"]}))


@router.post("/deactivate")
async def deactivate_account(req: Deactivate, response: Response, user: dict = Depends(get_current_user)):
    """Desativação temporária: some das buscas e do placar, tudo é mantido. Entrar de novo reativa."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha incorreta")
    await db.users.update_one({"id": user["id"]}, {"$set": {"deactivated": True}})
    await db.sessions.delete_many({"user_id": user["id"]})
    response.delete_cookie("vdb_session", path="/")
    return {"ok": True}


@router.post("/delete-account")
async def delete_account(req: AccountDelete, request: Request, response: Response, user: dict = Depends(get_current_user)):
    """Exclusão definitiva (LGPD): apaga conta, sessões e histórico de pedais. Alertas reportados ficam para a comunidade."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha incorreta")
    await db.sessions.delete_many({"user_id": user["id"]})
    await db.rides.delete_many({"user_id": user["id"]})
    # alertas ainda não aprovados somem com a conta; os já publicados continuam no mapa para proteger a comunidade
    for oid in await db.obstacles.distinct("id", {"user_id": user["id"], "status": {"$in": ["pendente", "recusado"]}}):
        await db.obstacle_photos.delete_many({"obstacle_id": oid})
    await db.obstacles.delete_many({"user_id": user["id"], "status": {"$in": ["pendente", "recusado"]}})
    await db.chat_messages.delete_many({"user_id": user["id"]})
    await db.meetups.delete_many({"user_id": user["id"]})
    await db.meetups.update_many(
        {"going_ids": user["id"]}, {"$pull": {"going_ids": user["id"], "going_names": user["name"]}}
    )
    mine = await db.shop_reviews.distinct("shop_id", {"user_id": user["id"]})
    await db.shop_reviews.delete_many({"user_id": user["id"]})
    await db.shops.delete_many({"added_by": user["id"], "status": "pendente"})
    if mine:
        from routers.shops import recompute_rating

        for sid in mine:
            await recompute_rating(sid)
    await db.notifications.delete_many({"user_id": user["id"]})
    await db.follows.delete_many({"$or": [{"follower_id": user["id"]}, {"followee_id": user["id"]}]})
    await db.users.delete_one({"id": user["id"]})
    response.delete_cookie("vdb_session", path="/")
    return {"ok": True}


@router.post("/onboarding", response_model=User)
async def set_onboarding(req: OnboardingUpdate, user: dict = Depends(get_current_user)):
    """Marca a tela de boas-vindas como vista (`done=true`) ou manda mostrar de novo (`done=false`)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    await db.users.update_one({"id": user["id"]}, {"$set": {"onboarded": req.done}})
    return user_from_doc(await db.users.find_one({"id": user["id"]}))


@router.post("/forgot")
async def forgot_password(req: ForgotPassword, request: Request):
    """Manda um link de redefinição por e-mail. A resposta é sempre a mesma, exista a conta ou não (não revela quem é cadastrado)."""
    await hit(f"forgot:{client_ip(request)}", 10, 3600)  # contra quem usa o botão para encher a caixa de e-mail dos outros
    result = {"ok": True, "email_enabled": mail_enabled()}
    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        return result
    now = datetime.now(timezone.utc)
    recent = await db.password_resets.count_documents({"user_id": user["id"], "created_at": {"$gte": now - timedelta(hours=1)}})
    if recent >= RESET_MAX_PER_HOUR:
        return result  # pedidos demais: ignora em silêncio
    base = _app_url()
    if not base or not mail_enabled():
        logger.warning("Recuperação de senha pedida, mas APP_URL ou o e-mail não estão configurados")
        return result
    token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one(
        {
            "token_hash": _hash_token(token),
            "user_id": user["id"],
            "created_at": now,
            "expires_at": now + RESET_TTL,
            "used": False,
        }
    )
    subject, text, html = reset_email(user["name"], f"{base}/redefinir-senha?token={token}")
    await send_mail(user["email"], subject, text, html)
    return result


@router.post("/reset")
async def reset_password(req: ResetPassword, request: Request):
    """Troca a senha com o link recebido por e-mail (uso único, 1 hora). Encerra todas as sessões abertas."""
    await hit(f"reset:{client_ip(request)}", 20, 3600)
    now = datetime.now(timezone.utc)
    rec = await db.password_resets.find_one_and_update(
        {"token_hash": _hash_token(req.token), "used": False, "expires_at": {"$gt": now}},
        {"$set": {"used": True}},
    )
    if not rec:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Peça um novo na tela de login.")
    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"password_hash": hash_password(req.new_password), "password_changed": True}},
    )
    await db.sessions.delete_many({"user_id": rec["user_id"]})
    await db.password_resets.delete_many({"user_id": rec["user_id"]})
    return {"ok": True}
