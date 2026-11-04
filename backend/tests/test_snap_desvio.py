"""Trecho que o roteador alonga (volta no quarteirão) vira linha reta; trecho normal segue a rua."""
from lib.snap import _segment_or_straight

A, B = [-3.7300, -38.5200], [-3.7310, -38.5200]  # ~110 m


def test_detour_falls_back_to_straight():
    volta = {"coordinates": [A, [-3.7300, -38.5180], [-3.7310, -38.5180], B]}  # ~450 m
    assert _segment_or_straight(A, B, volta) == [A, B]


def test_normal_route_is_kept():
    rua = {"coordinates": [A, [-3.7305, -38.5199], B]}
    assert _segment_or_straight(A, B, rua) == rua["coordinates"]


def test_no_route_gives_straight():
    assert _segment_or_straight(A, B, None) == [A, B]
