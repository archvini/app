"""Segurança: rotas de teste antigas removidas, senha mínima, limite de tentativas de login."""
import uuid

import httpx

from tests.conftest import API_URL


def test_old_template_endpoints_are_gone():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    assert c.get("/status").status_code in (404, 405)
    assert c.post("/status", json={"client_name": "x"}).status_code in (404, 405)


def test_short_password_is_rejected_and_security_headers_present():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/register", json={"name": "Curta", "email": f"s_{uuid.uuid4().hex[:8]}@example.com", "password": "1234567"})
    assert r.status_code == 422
    assert r.headers.get("x-content-type-options") == "nosniff"


def test_login_is_locked_after_repeated_wrong_passwords():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    email = f"lock_{uuid.uuid4().hex[:8]}@example.com"
    codes = [c.post("/auth/login", json={"email": email, "password": "errada123"}).status_code for _ in range(9)]
    assert codes[:8] == [401] * 8 and codes[8] == 429
