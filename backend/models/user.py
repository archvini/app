from datetime import datetime
from uuid import uuid4

import re

from pydantic import BaseModel, EmailStr, Field, field_validator


def _uuid() -> str:
    return str(uuid4())


class User(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    email: EmailStr
    bio: str = ""
    bike_type: str = "urbana"
    city: str = "Fortaleza"
    xp: int = 0
    level: int = 1
    total_km: float = 0.0
    reports_count: int = 0
    confirms_count: int = 0
    badge_ids: list[str] = Field(default_factory=list)
    avatar: str = ""  # foto de perfil: data URL pequena (o navegador reduz para ~256 px)
    onboarded: bool = False  # já viu a tela de boas-vindas / tutorial
    is_moderator: bool = False  # conta dev: analisa e aprova os alertas (calculado no servidor, nunca vem do cliente)
    created_at: datetime


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    bike_type: str = "urbana"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


AVATAR_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")
AVATAR_MAX_CHARS = 150_000  # ~110 KB de imagem; o navegador envia ~15 KB


class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    bike_type: str | None = None
    avatar: str | None = None  # "" remove a foto

    @field_validator("avatar")
    @classmethod
    def _avatar_ok(cls, v: str | None) -> str | None:
        if v and (len(v) > AVATAR_MAX_CHARS or not AVATAR_RE.match(v)):
            raise ValueError("Imagem inválida ou grande demais")
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)


class AccountDelete(BaseModel):
    password: str


class OnboardingUpdate(BaseModel):
    done: bool = True


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=100)


class EmailChange(BaseModel):
    new_email: EmailStr
    password: str


class Deactivate(BaseModel):
    password: str


class PublicUser(BaseModel):
    """O que qualquer ciclista logado vê de outro: nunca e-mail."""

    id: str
    name: str
    avatar: str = ""
    bio: str = ""
    bike_type: str = "urbana"
    level: int = 1
    xp: int = 0
    total_km: float = 0.0
    reports_count: int = 0
    badge_ids: list[str] = Field(default_factory=list)
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False  # eu sigo esta pessoa
    follows_me: bool = False  # esta pessoa me segue
