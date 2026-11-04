"""Ajusta (snap) as ciclovias às ruas reais.

As ciclovias do seed têm só 3–6 pontos digitados à mão; ligados em linha reta eles cortam quarteirões
e o mar (os "traços longos" no mapa). Aqui pedimos ao roteador de bike a geometria real passando por
esses pontos e guardamos a polilinha densa em `coordinates`. Os pontos originais ficam em `waypoints`.
"""

import asyncio
import logging

from lib.db import db
from lib.routing import bike_route, haversine_m, polyline_length_m

logger = logging.getLogger(__name__)


def nearest_point_on_polyline(point: tuple[float, float], line: list[list[float]]) -> tuple[float, float]:
    """Ponto da polilinha mais próximo de `point` (projeção em plano local — suficiente para distâncias de cidade)."""
    import math

    lat0 = math.radians(point[0])
    kx = 111320.0 * math.cos(lat0)  # metros por grau de longitude
    ky = 110540.0  # metros por grau de latitude
    px, py = point[1] * kx, point[0] * ky
    best = (line[0][0], line[0][1])
    best_d = float("inf")
    for a, b in zip(line, line[1:]):
        ax, ay, bx, by = a[1] * kx, a[0] * ky, b[1] * kx, b[0] * ky
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        cx, cy = ax + t * dx, ay + t * dy
        d = (px - cx) ** 2 + (py - cy) ** 2
        if d < best_d:
            best_d = d
            best = (cy / ky, cx / kx)
    return best


DETOUR_RATIO = 1.25  # trecho passa disso (+ folga) = o roteador deu a volta no quarteirão
DETOUR_SLACK_M = 40
CONCURRENCY = 6


def _segment_or_straight(a: list[float], b: list[float], route: dict | None) -> list[list[float]]:
    """Geometria de UM trecho entre dois toques. Se o roteador deu a volta (mão única, canteiro central),
    usamos a linha reta entre os toques: quem desenhou já tocou a cada curva, então ela segue a avenida."""
    straight = [[a[0], a[1]], [b[0], b[1]]]
    if not route or len(route["coordinates"]) < 2:
        return straight
    limit = haversine_m((a[0], a[1]), (b[0], b[1])) * DETOUR_RATIO + DETOUR_SLACK_M
    return route["coordinates"] if polyline_length_m(route["coordinates"]) <= limit else straight


async def snap_waypoints(waypoints: list[list[float]]) -> list[list[float]] | None:
    """Cola o traçado nas ruas, trecho a trecho (toque a toque). None se o roteador falhar em tudo."""
    pts = [(p[0], p[1]) for p in waypoints]
    if len(pts) < 2:
        return None
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(a, b):
        async with sem:
            return await bike_route([a, b])

    routes = await asyncio.gather(*(one(a, b) for a, b in zip(pts, pts[1:])))
    if not any(routes):
        return None  # roteador fora do ar: quem chamou decide (erro 503 ou fallback)
    merged: list[list[float]] = []
    for a, b, route in zip(pts, pts[1:], routes):
        seg = _segment_or_straight(list(a), list(b), route)
        merged.extend(seg if not merged else seg[1:])
    return merged


def looks_sane(raw: list[list[float]], snapped: list[list[float]]) -> bool:
    """Descarta um snap absurdo (ex.: desvio enorme): o comprimento não pode passar de ~2,5x o da linha reta."""
    raw_len = polyline_length_m(raw)
    if raw_len <= 0:
        return False
    return polyline_length_m(snapped) <= raw_len * 2.5 + 200 and haversine_m(
        (raw[0][0], raw[0][1]), (snapped[0][0], snapped[0][1])
    ) < 500


async def snap_lane_doc(lane: dict) -> bool:
    """Ajusta uma ciclovia do banco. Retorna True se gravou geometria nova."""
    waypoints = lane.get("waypoints") or lane["coordinates"]
    snapped = await snap_waypoints(waypoints)
    if not snapped or not looks_sane(waypoints, snapped):
        logger.warning("snap da ciclovia %s não aplicado (roteador indisponível ou resultado suspeito)", lane["id"])
        return False
    km = round(polyline_length_m(snapped) / 1000, 2)
    await db.bikelanes.update_one(
        {"id": lane["id"]},
        {"$set": {"coordinates": snapped, "waypoints": waypoints, "snapped": True, "length_km": km}},
    )
    # alertas de exemplo (ids "seed-<lane>-<tipo>") passam a ficar exatamente sobre a via
    async for o in db.obstacles.find({"id": {"$regex": f"^seed-{lane['id']}-"}}):
        lat, lng = nearest_point_on_polyline((o["lat"], o["lng"]), snapped)
        await db.obstacles.update_one({"id": o["id"]}, {"$set": {"lat": lat, "lng": lng}})
    logger.info("ciclovia %s ajustada às ruas: %d pontos, %.2f km", lane["id"], len(snapped), km)
    return True


async def snap_pending_lanes() -> int:
    """Ajusta todas as ciclovias ainda não ajustadas. Melhor esforço — nunca levanta exceção."""
    done = 0
    try:
        async for lane in db.bikelanes.find({"snapped": {"$ne": True}}):
            if await snap_lane_doc(lane):
                done += 1
    except Exception as exc:
        logger.warning("snap_pending_lanes interrompido: %s", exc)
    return done
