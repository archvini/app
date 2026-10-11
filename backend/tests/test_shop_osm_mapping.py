"""Mapeamento OSM → locais: estações do Bicicletar e aluguel de bicicletas."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "vaidebike_test")

from routers.admin import _shop_from_osm  # noqa: E402


def _el(tags: dict) -> dict:
    return {"type": "node", "id": 1, "lat": -3.73, "lon": -38.52, "tags": tags}


def test_bicicletar_station_is_mapped():
    d = _shop_from_osm(_el({"amenity": "bicycle_rental", "network": "Bicicletar", "name": "Estação Praia de Iracema"}))
    assert d and d["kind"] == "bicicletar" and d["name"] == "Estação Praia de Iracema"


def test_unnamed_rental_gets_default_name():
    assert _shop_from_osm(_el({"amenity": "bicycle_rental", "operator": "Serttel"}))["name"] == "Estação Bicicletar"
    assert _shop_from_osm(_el({"amenity": "bicycle_rental"}))["name"] == "Aluguel de bicicletas"


def test_other_kinds_unchanged():
    assert _shop_from_osm(_el({"shop": "bicycle", "name": "Bike X"}))["kind"] == "oficina"
    assert _shop_from_osm(_el({"shop": "tyres"}))["kind"] == "borracharia"
