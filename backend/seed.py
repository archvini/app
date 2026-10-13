"""Seed do VaiDeBike Fortaleza: ciclovias/ciclofaixas reais, alertas de exemplo e contas demo.

Run: cd /app/backend && python seed.py
Idempotente — upsert por id/e-mail, alertas de exemplo só quando a coleção está vazia.
"""

import asyncio
from datetime import datetime, timezone

import secrets

from lib.auth import hash_password
from lib.db import db, ensure_indexes
from lib.game import apply_badges
from lib.snap import snap_pending_lanes

LANES = [
    {
        "id": "beira-mar",
        "name": "Ciclovia da Av. Beira-Mar (Infante Dom Henrique)",
        "kind": "ciclovia",
        "length_km": 2.9,
        "notes": "Orla litorânea, trecho mais pedaleiro da cidade. Vento forte no fim da tarde.",
        "coordinates": [[-3.7215, -38.5160], [-3.7235, -38.5120], [-3.7255, -38.5070], [-3.7270, -38.5010], [-3.7285, -38.4950]],
    },
    {
        "id": "washington-soares",
        "name": "Ciclofaixa da Av. Washington Soares",
        "kind": "ciclofaixa",
        "length_km": 5.6,
        "notes": "Liga Edson Queiroz à Messejana. Faixa compartilhada com ônibus em alguns trechos.",
        "coordinates": [[-3.7565, -38.4900], [-3.7570, -38.5000], [-3.7575, -38.5100], [-3.7580, -38.5200], [-3.7585, -38.5300], [-3.7590, -38.5400]],
    },
    {
        "id": "aguanambi",
        "name": "Ciclovia da Av. Aguanambi",
        "kind": "ciclovia",
        "length_km": 1.7,
        "notes": "Eixo centro-oeste, conexão com o centro e o bairro Monte Castelo.",
        "coordinates": [[-3.7360, -38.5410], [-3.7410, -38.5415], [-3.7460, -38.5420], [-3.7510, -38.5425]],
    },
    {
        "id": "domingos-olimpio",
        "name": "Ciclovia da Av. Domingos Olímpio",
        "kind": "ciclovia",
        "length_km": 2.3,
        "notes": "Centro, ao lado da estação do metrô. Movimentada no horário de rush.",
        "coordinates": [[-3.7295, -38.5260], [-3.7300, -38.5320], [-3.7305, -38.5390], [-3.7310, -38.5460]],
    },
    {
        "id": "santos-dumont",
        "name": "Ciclofaixa da Av. Santos Dumont",
        "kind": "ciclofaixa",
        "length_km": 2.4,
        "notes": "Do centro para Aldeota/Papicu. Atenção às saídas de garagem.",
        "coordinates": [[-3.7280, -38.5260], [-3.7290, -38.5190], [-3.7300, -38.5120], [-3.7310, -38.5060]],
    },
    {
        "id": "godofredo-maciel",
        "name": "Ciclovia da Av. Godofredo Maciel",
        "kind": "ciclovia",
        "length_km": 1.8,
        "notes": "Área industrial, tráfego de caminhões. Alguns trechos com asfalto irregular.",
        "coordinates": [[-3.7020, -38.5660], [-3.7050, -38.5600], [-3.7080, -38.5540]],
    },
    {
        "id": "parque-coco",
        "name": "Ciclovia do Parque do Cocó",
        "kind": "ciclovia",
        "length_km": 1.2,
        "notes": "Trecho de lazer dentro do parque, sombra e natureza.",
        "coordinates": [[-3.7490, -38.4860], [-3.7520, -38.4820], [-3.7550, -38.4780]],
    },
]

DEMO_USERS = [
    {
        "email": "demo@vaidebike.app",
        "name": "Ciclista Demo",
        "bio": "Conta de demonstração do VaiDeBike. Faça login para explorar!",
        "bike_type": "urbana",
        "xp": 620,
        "level": 2,
        "total_km": 32.4,
        "reports_count": 4,
        "confirms_count": 2,
    },
    {
        "email": "maria@vaidebike.app",
        "name": "Maria Pedalante",
        "bio": "Todo dia na Beira-Mar, chova ou faça sol.",
        "bike_type": "speed",
        "xp": 1450,
        "level": 3,
        "total_km": 58.2,
        "reports_count": 12,
        "confirms_count": 8,
    },
    {
        "email": "joao@vaidebike.app",
        "name": "João Bike Fortal",
        "bio": "Pedalando pela ciclovia da Aguanambi desde 2019.",
        "bike_type": "mtb",
        "xp": 980,
        "level": 2,
        "total_km": 76.5,
        "reports_count": 7,
        "confirms_count": 5,
    },
     {
        "email": "marcosviniciuspessoa6@gmail.com",
        "name": "Vinicíus",
        "bio": "DEV.",
        "bike_type": "mtb",
        "xp": 980,
        "level": 2,
        "total_km": 76.5,
        "reports_count": 7,
        "confirms_count": 5,
    },
]

# Alertas de exemplo anexados aos usuários demo — inseridos apenas com a coleção vazia.
DEMO_OBSTACLES = [
    {"lane": "beira-mar", "user_email": "maria@vaidebike.app", "type": "buraco", "severity": "alta", "description": "Buraco grande na ciclovia perto do Clube Náutico, some com a maré alta e molha tudo.", "lat": -3.7247, "lng": -38.5105, "confirms": 3},
    {"lane": "washington-soares", "user_email": "joao@vaidebike.app", "type": "obra", "severity": "media", "description": "Obra na faixa da direita na altura do shopping, desvio para a calçada sem rampa.", "lat": -3.7577, "lng": -38.5140, "confirms": 2},
    {"lane": "aguanambi", "user_email": "demo@vaidebike.app", "type": "trecho_inacabado", "severity": "alta", "description": "Ciclovia para no meio da avenida sem sinalização — obriga entrar na pista entre carros.", "lat": -3.7448, "lng": -38.5418, "confirms": 4},
    {"lane": "domingos-olimpio", "user_email": "demo@vaidebike.app", "type": "falta_iluminacao", "severity": "media", "description": "Postes queimados no trecho da estação, péssimo de pedalar à noite.", "lat": -3.7302, "lng": -38.5355, "confirms": 1},
    {"lane": "santos-dumont", "user_email": "joao@vaidebike.app", "type": "buraco", "severity": "baixa", "description": "Asfalto ruim na ciclofaixa depois do Viaduto, vibra muito.", "lat": -3.7296, "lng": -38.5145, "confirms": 1},
    {"lane": "godofredo-maciel", "user_email": "maria@vaidebike.app", "type": "trecho_inacabado", "severity": "media", "description": "Pista interrompida por canteiro, precisa descer e subir a calçada.", "lat": -3.7065, "lng": -38.5570, "confirms": 0},
]


async def main(snap: bool = True) -> None:
    await ensure_indexes()

    # 1) Ciclovias/ciclofaixas — upsert por id (idempotente).
    # Não sobrescreve a geometria já ajustada às ruas: só regrava se os waypoints do seed mudaram.
    for lane in LANES:
        existing = await db.bikelanes.find_one({"id": lane["id"]})
        if existing and existing.get("snapped") and existing.get("waypoints") == lane["coordinates"]:
            continue
        doc = {**lane, "waypoints": lane["coordinates"], "snapped": False}
        await db.bikelanes.update_one({"id": lane["id"]}, {"$set": doc}, upsert=True)
    print(f"bikelanes: {await db.bikelanes.count_documents({})} rotas garantidas")

    # 2) Usuários demo — upsert por e-mail, senha padrão "senha123"
    now = datetime.now(timezone.utc)
    users_by_email: dict[str, dict] = {}
    for u in DEMO_USERS:
        doc = {
            "id": f"seed-{u['email'].split('@')[0]}",
            "name": u["name"],
            "email": u["email"],
            "bio": u["bio"],
            "bike_type": u["bike_type"],
            "city": "Fortaleza",
            "xp": u["xp"],
            "level": u["level"],
            "total_km": u["total_km"],
            "reports_count": u["reports_count"],
            "confirms_count": u["confirms_count"],
            "badge_ids": [],
        }
        # senha e data só na criação: rodar o seed de novo NÃO devolve a conta dev à senha pública
        await db.users.update_one(
            {"email": u["email"]},
            {"$set": doc, "$setOnInsert": {"password_hash": hash_password(secrets.token_urlsafe(24)), "created_at": now}},
            upsert=True,
        )
        fresh = await db.users.find_one({"email": u["email"]})
        users_by_email[u["email"]] = fresh
        fresh, _ = await apply_badges(fresh)
        print(f"user: {u['email']} (conta demo: login bloqueado em produção; ALLOW_DEMO_LOGIN=1 só para testes locais)")

    # 3) Alertas de exemplo — só se a coleção estiver vazia
    if await db.obstacles.count_documents({}) == 0:
        docs = []
        for o in DEMO_OBSTACLES:
            u = users_by_email[o["user_email"]]
            docs.append(
                {
                    "id": f"seed-{o['lane']}-{o['type']}",
                    "user_id": u["id"],
                    "user_name": u["name"],
                    "type": o["type"],
                    "severity": o["severity"],
                    "description": o["description"],
                    "lat": o["lat"],
                    "lng": o["lng"],
                    "status": "ativo",
                    "confirms": o["confirms"],
                    "created_at": now,
                }
            )
        await db.obstacles.insert_many(docs)
    print(f"obstacles: {await db.obstacles.count_documents({})} alertas no mapa")

    # 4) Cola as ciclovias nas ruas reais (roteador de bike). Sem internet, mantém as linhas retas e avisa.
    snapped = await snap_pending_lanes() if snap else 0
    pending = await db.bikelanes.count_documents({"snapped": {"$ne": True}})
    print(f"ciclovias ajustadas às ruas: {snapped}" + (f" ({pending} pendentes — sem acesso ao roteador)" if pending else ""))

    # 5) Índices podem ter sido recriados após upserts — garante de novo por segurança
    await ensure_indexes()
    print("seed concluído.")


if __name__ == "__main__":
    asyncio.run(main())
