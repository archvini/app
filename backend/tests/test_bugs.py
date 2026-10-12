"""Relatos de problemas do app: qualquer pessoa envia; só a equipe lê."""
import uuid

import httpx

from tests.conftest import API_URL


def test_bug_report_is_open_to_all_but_list_is_staff_only():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/bugs", json={"category": "travou", "message": f"A tela ficou branca {uuid.uuid4().hex[:6]}", "page": "/map"})
    assert r.status_code == 200, r.text
    assert c.post("/bugs", json={"category": "erro", "message": "curto"}).status_code == 422  # mínimo 10 letras
    assert c.get("/bugs").status_code in (401, 403)  # lista é só da equipe
