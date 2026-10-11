import re
from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

ShopKind = Literal["borracharia", "oficina", "autoreparo", "bicicletar"]
ShopStatus = Literal["pendente", "ativo", "recusado"]

PHONE_RE = re.compile(r"^[0-9+()\-\s]{8,20}$")


def _uuid() -> str:
    return str(uuid4())


class Shop(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    kind: ShopKind = "oficina"
    lat: float
    lng: float
    address: str = ""
    phone: str = ""
    hours: str = ""
    description: str = ""
    website: str = ""
    status: ShopStatus = "ativo"
    source: Literal["osm", "comunidade"] = "comunidade"  # osm = OpenStreetMap (© colaboradores, ODbL)
    added_by_name: str = ""
    rating_avg: float = 0.0
    rating_count: int = 0
    created_at: datetime | None = None


class ShopCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    kind: ShopKind = "oficina"
    lat: float = Field(ge=-4.2, le=-3.4)  # só Fortaleza e arredores
    lng: float = Field(ge=-39.0, le=-38.1)
    address: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=20)
    hours: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=300)

    @field_validator("phone")
    @classmethod
    def _phone_ok(cls, v: str) -> str:
        v = v.strip()
        if v and not PHONE_RE.match(v):
            raise ValueError("Telefone inválido")
        return v


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=300)


class ShopReview(BaseModel):
    user_id: str
    user_name: str
    user_avatar: str = ""
    rating: int
    comment: str = ""
    created_at: datetime


class ShopDetail(Shop):
    reviews: list[ShopReview] = Field(default_factory=list)
    my_review: ShopReview | None = None
    can_delete: bool = False  # quem sugeriu o local ou a conta dev pode removê-lo


class ShopReject(BaseModel):
    reason: str = Field(default="", max_length=200)
