import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, LayerSpecification, Map as MLMap, Marker as MLMarker, MarkerOptions, Popup, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { hazardColor, hazardSvg } from "@/lib/hazards";
import { WARN_M } from "@/lib/proximity";
import type { HazardLevel } from "@/lib/proximity";
import { SHOP_META, shopSvg } from "@/lib/shops";
import type { BikeLane, Obstacle, Shop } from "@/lib/types";

export interface FocusRequest {
  lat: number;
  lng: number;
  zoom?: number;
}

interface FortalezaMapProps {
  bikeLanes: BikeLane[];
  obstacles: Obstacle[];
  userPos?: { lat: number; lng: number } | null;
  /** rumo do ciclista em graus (0 = norte); gira a seta e, ao navegar, o próprio mapa */
  heading?: number | null;
  /** modo guiado: mapa inclinado em 3D girando com o rumo, zoom alto e sem o círculo de radar */
  navigating?: boolean;
  /** a câmera acompanha o ciclista suavemente (como no Uber/99) */
  follow?: boolean;
  /** o usuário arrastou o mapa com o dedo/mouse — o pai deve desligar o `follow` */
  onUserPan?: () => void;
  /** rota (trecho que falta percorrer) em [lat, lng] */
  route?: [number, number][] | null;
  /** ids de obstáculos que ficam no caminho da rota (ganham destaque) */
  routeObstacleIds?: string[];
  /** nível de aproximação de cada perigo à frente (atenção/perigo) — o ícone cresce e pulsa */
  hazardLevels?: Record<string, HazardLevel>;
  /** perigo principal à frente: uma linha tracejada liga o ciclista até ele */
  guideTo?: { lat: number; lng: number } | null;
  /** enquadra a rota inteira na tela quando ela muda (pré-visualização) */
  fitRoute?: boolean;
  destination?: { lat: number; lng: number } | null;
  /** altura (px) coberta pelo painel inferior — usada para centralizar no espaço visível */
  bottomInset?: number;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** toque simples num ponto vazio do mapa (escolher destino / reportar); arrastar e pinça não contam */
  onTap?: (lat: number, lng: number) => void;
  /** ponto tocado, marcado com um pino até o usuário decidir o que fazer */
  tapPoint?: { lat: number; lng: number } | null;
  onSelectObstacle?: (o: Obstacle) => void;
  /** borracharias, oficinas e pontos de autorreparo (ícones redondos azuis/roxos/verdes) */
  shops?: Shop[];
  onSelectShop?: (s: Shop) => void;
  /** traçado em desenho (conta dev): pontos tocados, ligados por uma linha tracejada amarela */
  drawPoints?: [number, number][];
  /** modo apagar: tocar num traçado o seleciona (sem isso, tocar numa ciclovia só marca um ponto no mapa) */
  onSelectLane?: (lane: BikeLane) => void;
  focus?: FocusRequest | null;
  className?: string;
}

type LatLng = { lat: number; lng: number };
type FC = Parameters<GeoJSONSource["setData"]>[0];

const FORTALEZA_CENTER: [number, number] = [-38.5267, -3.7319]; // [lng, lat]
const POS_ANIM_MS = 900;
const NAV_PITCH = 60;
const LANE_LAYERS = ["lanes-solid", "lanes-faixa", "lanes-approx"];

// Mapa vetorial gratuito (OpenFreeMap: dados do OpenStreetMap, sem chave de API), escurecido por código em `darken`.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Plano B se o servidor de estilo não responder: tiles de imagem do OpenStreetMap, mais escuros.
const RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-brightness-max": 0.5, "raster-saturation": -0.5 } }],
};

const EMPTY = { type: "FeatureCollection", features: [] } as unknown as FC;
const fc = (features: unknown[]): FC => ({ type: "FeatureCollection", features }) as unknown as FC;
const lineFeature = (coords: [number, number][], properties: Record<string, unknown> = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates: coords },
});
/** [lat, lng] → [lng, lat] (o MapLibre usa a ordem inversa do Leaflet) */
const flip = (p: [number, number]): [number, number] => [p[1], p[0]];

/** Menor giro entre dois ângulos — evita a seta dar a volta inteira ao passar de 359° para 1°. */
function nextAngle(prev: number, target: number): number {
  const delta = ((target - prev + 540) % 360) - 180;
  return prev + delta;
}

/** Círculo em metros como polígono (o MapLibre não tem círculo em metros). */
function circlePolygon(c: LatLng, radiusM: number, steps = 48) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/**
 * Marcador HTML posicionado pelo pixel de "ponta" (ax, ay) dentro do desenho — a haste da placa ou o bico do pino
 * fica exatamente sobre o ponto do mapa.
 */
function htmlMarker(html: string, w: number, h: number, ax: number, ay: number, z: number, options: MarkerOptions = {}) {
  const el = document.createElement("div");
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.zIndex = String(z);
  el.dataset.vdbMarker = "1";
  el.innerHTML = html;
  const marker = new maplibregl.Marker({ element: el, anchor: "top-left", offset: [-ax, -ay], ...options });
  return { marker, el };
}

/**
 * Marcador em forma de placa de advertência (losango na cor do tipo, ícone do perigo dentro, haste até o ponto exato).
 * A gravidade vira o anel pulsante (alta = rápido); o nível de aproximação é aplicado depois, por classe.
 */
function obstacleHtml(o: Obstacle, onRoute: boolean): string {
  const route = onRoute ? " hz--route" : "";
  return `<span class="hz hz--${o.severity}${route}" style="--hz:${hazardColor(o.type)}" data-testid="obstacle-marker" data-obstacle-type="${o.type}" data-obstacle-id="${o.id}"><span class="hz-post"></span><span class="hz-ring"></span><span class="hz-sign"><span class="hz-glyph">${hazardSvg(o.type, 16)}</span></span></span>`;
}

/** Bolha redonda com o desenho do tipo de local; a cor diferencia de longe e o "bico" aponta o ponto exato. */
function shopHtml(shop: Shop): string {
  const m = SHOP_META[shop.kind];
  return `<span data-testid="shop-marker" data-shop-id="${shop.id}" style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))"><span style="display:flex;height:34px;width:34px;align-items:center;justify-content:center;border-radius:9999px;border:2.5px solid #fff;background:${m.color}">${shopSvg(shop.kind, 18)}</span><span style="margin-top:-3px;height:0;width:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #fff"></span></span>`;
}

const USER_HTML = `<span class="vdb-nav vdb-nav--still" data-testid="gps-user-beacon"><span class="vdb-nav-pulse"></span><span class="vdb-nav-dot"></span><svg class="vdb-nav-arrow" viewBox="0 0 44 44" aria-hidden="true"><path d="M22 4 L36 38 L22 30 L8 38 Z" fill="#10B981" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/></svg></span>`;
const DEST_HTML = `<span class="vdb-dest" data-testid="nav-destination-pin"><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C8 1 2 7 2 15c0 10 14 25 14 25s14-15 14-25C30 7 24 1 16 1z" fill="#F97316" stroke="#ffffff" stroke-width="2.5"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg></span>`;
const TAP_HTML = `<span class="vdb-tap" data-testid="map-tap-pin"><span class="vdb-tap-ring"></span><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C8 1 2 7 2 15c0 10 14 25 14 25s14-15 14-25C30 7 24 1 16 1z" fill="#38BDF8" stroke="#ffffff" stroke-width="2.5"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg></span>`;

/** Pinta o mapa claro (Positron) com o tema escuro tático e troca os prédios planos por prédios 3D. */
function darken(map: MLMap) {
  const style = map.getStyle();
  for (const l of style.layers ?? []) {
    const id = l.id.toLowerCase();
    try {
      if (l.type === "background") {
        map.setPaintProperty(l.id, "background-color", "#0B1120");
      } else if (l.type === "fill") {
        if (/building/.test(id)) map.setLayoutProperty(l.id, "visibility", "none"); // o 3D (abaixo) assume
        else map.setPaintProperty(l.id, "fill-color", /water/.test(id) ? "#0C1B33" : /park|wood|forest|grass|green|garden/.test(id) ? "#0E1D1A" : "#111A2B");
      } else if (l.type === "line") {
        const color = /casing/.test(id)
          ? "#0B1120"
          : /water/.test(id)
            ? "#0C1B33"
            : /boundary/.test(id)
              ? "#334155"
              : /motorway|trunk|primary/.test(id)
                ? "#3B4A63"
                : "#243044";
        map.setPaintProperty(l.id, "line-color", color);
      } else if (l.type === "symbol") {
        map.setPaintProperty(l.id, "text-color", "#94A3B8");
        map.setPaintProperty(l.id, "text-halo-color", "#0B1120");
      }
    } catch {
      // camada exótica: fica como veio
    }
  }
  // prédios em 3D com a altura que o OpenStreetMap informa (8 m quando não informa)
  const source = Object.entries(style.sources ?? {}).find(([, s]) => s.type === "vector")?.[0];
  if (source) {
    map.addLayer({
      id: "vdb-buildings-3d",
      type: "fill-extrusion",
      source,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#1E2A44",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    } as unknown as LayerSpecification);
  }
}

/** Fontes e camadas de desenho do app (ciclovias, rota, radar, traçado em edição). Os dados entram depois, por efeito. */
function addOverlays(map: MLMap) {
  for (const id of ["radar", "lanes", "route", "guide", "draw", "drawpts"]) map.addSource(id, { type: "geojson", data: EMPTY });
  const add = (layer: unknown) => map.addLayer(layer as LayerSpecification);
  const laneWidth = ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5, 19, 8];

  add({ id: "radar-fill", type: "fill", source: "radar", paint: { "fill-color": "#10B981", "fill-opacity": 0.06 } });
  add({
    id: "radar-line",
    type: "line",
    source: "radar",
    paint: { "line-color": "#34D399", "line-width": 1.5, "line-opacity": 0.9, "line-dasharray": [3, 4] },
  });
  add({
    id: "lanes-solid",
    type: "line",
    source: "lanes",
    filter: ["==", ["get", "dash"], "solid"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": laneWidth, "line-opacity": 0.85 },
  });
  add({
    id: "lanes-faixa",
    type: "line",
    source: "lanes",
    filter: ["==", ["get", "dash"], "faixa"],
    layout: { "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": laneWidth, "line-opacity": 0.85, "line-dasharray": [1.6, 1.6] },
  });
  add({
    id: "lanes-approx",
    type: "line",
    source: "lanes",
    filter: ["==", ["get", "dash"], "approx"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.4, "line-dasharray": [0.7, 3] },
  });
  add({
    id: "route-casing",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#06101F", "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 8, 18, 18] },
  });
  add({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#38BDF8", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 10] },
  });
  add({
    id: "guide-line",
    type: "line",
    source: "guide",
    layout: { "line-cap": "round" },
    paint: { "line-color": "#FB7185", "line-width": 3, "line-opacity": 0.9, "line-dasharray": [0.7, 3] },
  });
  add({
    id: "draw-line",
    type: "line",
    source: "draw",
    paint: { "line-color": "#FACC15", "line-width": 5, "line-opacity": 0.95, "line-dasharray": [1, 1.4] },
  });
  add({
    id: "draw-pts",
    type: "circle",
    source: "drawpts",
    paint: {
      "circle-radius": ["case", ["==", ["get", "end"], 1], 7, 5],
      "circle-color": ["case", ["==", ["get", "first"], 1], "#22C55E", "#FACC15"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

/**
 * Mapa escuro de Fortaleza em MapLibre GL: ciclovias/ciclofaixas, marcadores de obstáculos, rota e o ciclista.
 * Gestos: arrastar, pinça para zoom, dois dedos para girar e inclinar, duplo toque e toque simples para marcar um ponto.
 * Ao navegar, a câmera inclina (3D) e gira com o rumo, e a seta fica deitada sobre a rua.
 */
export default function FortalezaMap({
  bikeLanes,
  obstacles,
  userPos,
  heading,
  navigating,
  follow,
  onUserPan,
  route,
  routeObstacleIds,
  hazardLevels,
  guideTo,
  fitRoute,
  destination,
  bottomInset = 0,
  pickMode,
  onPick,
  onTap,
  tapPoint,
  onSelectObstacle,
  shops,
  onSelectShop,
  drawPoints,
  onSelectLane,
  focus,
  className,
}: FortalezaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  const shopMarkersRef = useRef<MLMarker[]>([]);
  const destMarkerRef = useRef<MLMarker | null>(null);
  const tapMarkerRef = useRef<MLMarker | null>(null);
  const userMarkerRef = useRef<{ marker: MLMarker; el: HTMLElement } | null>(null);
  const markersRef = useRef<Map<string, { marker: MLMarker; el: HTMLElement; sig: string }>>(new Map());
  const obstacleByIdRef = useRef<Map<string, Obstacle>>(new Map());
  const laneByIdRef = useRef<Map<string, BikeLane>>(new Map());
  const popupRef = useRef<Popup | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const populatedRef = useRef(false);
  const fittedRef = useRef(false);
  const focusedRef = useRef(false); // já foi para a localização do ciclista: o enquadramento inicial das ciclovias não pode desfazer

  // valores "mais recentes" lidos dentro de handlers de longa vida
  const pickRef = useRef<{ active: boolean; cb?: (lat: number, lng: number) => void }>({ active: false });
  const onSelectRef = useRef(onSelectObstacle);
  const onSelectShopRef = useRef(onSelectShop);
  const onSelectLaneRef = useRef(onSelectLane);
  const onTapRef = useRef(onTap);
  const onUserPanRef = useRef(onUserPan);
  const followRef = useRef(!!follow);
  const navigatingRef = useRef(!!navigating);
  const headingRef = useRef<number | null>(null);
  const insetRef = useRef(bottomInset);
  const userMovingRef = useRef(false); // dedo na tela mexendo no mapa: a câmera automática espera
  const curPosRef = useRef<LatLng | null>(null);
  const animRef = useRef<{ from: LatLng; to: LatLng; t0: number; raf: number | null } | null>(null);
  const angleRef = useRef(0);

  useEffect(() => {
    onSelectRef.current = onSelectObstacle;
    onSelectShopRef.current = onSelectShop;
    onSelectLaneRef.current = onSelectLane;
    onTapRef.current = onTap;
    onUserPanRef.current = onUserPan;
    navigatingRef.current = !!navigating;
    headingRef.current = typeof heading === "number" && Number.isFinite(heading) ? heading : null;
    insetRef.current = bottomInset;
  }, [onSelectObstacle, onSelectShop, onSelectLane, onTap, onUserPan, navigating, heading, bottomInset]);

  const setSource = (id: string, data: FC) => {
    (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  };

  /**
   * Câmera que acompanha o ciclista. Navegando: inclinada em 3D e girando com o rumo, com o ciclista um pouco abaixo
   * do centro (vê-se mais estrada à frente). Fora da navegação: norte para cima e plana, como antes.
   */
  const followCamera = (pos: LatLng, ms: number, zoom?: number) => {
    const map = mapRef.current;
    if (!map || userMovingRef.current) return;
    const nav = navigatingRef.current;
    const hd = headingRef.current;
    map.easeTo({
      center: [pos.lng, pos.lat],
      ...(zoom !== undefined ? { zoom } : {}),
      bearing: nav ? (hd ?? map.getBearing()) : 0,
      pitch: nav ? NAV_PITCH : 0,
      padding: { top: nav ? 160 : 0, bottom: insetRef.current, left: 0, right: 0 },
      duration: ms,
      easing: (t: number) => t,
      essential: true,
    });
  };

  // inicializa uma única vez (StrictMode remonta — o cleanup remove o mapa)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = new maplibregl.Map({
      container: el,
      style: STYLE_URL,
      center: FORTALEZA_CENTER,
      zoom: 12,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    // No celular o zoom é por pinça/duplo toque — sem botões cobrindo o mapa. No computador, + / − e a bússola.
    if (!window.matchMedia("(pointer: coarse)").matches) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    }

    let fellBack = false;
    map.on("error", () => {
      if (!readyRef.current && !fellBack) {
        fellBack = true;
        map.setStyle(RASTER_FALLBACK);
      }
    });
    map.on("style.load", () => {
      if (readyRef.current) return;
      readyRef.current = true;
      if (!fellBack) darken(map);
      addOverlays(map);
      setReady(true);
    });

    map.on("click", (e) => {
      if (!readyRef.current) return;
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest("[data-vdb-marker]")) return; // clique num marcador não é clique no mapa
      const box: [[number, number], [number, number]] = [
        [e.point.x - 10, e.point.y - 10],
        [e.point.x + 10, e.point.y + 10],
      ];
      const hit = map.queryRenderedFeatures(box, { layers: LANE_LAYERS })[0];
      const lane = hit ? laneByIdRef.current.get(String(hit.properties?.id)) : undefined;
      if (lane) {
        if (onSelectLaneRef.current) {
          onSelectLaneRef.current(lane);
          return;
        }
        popupRef.current?.remove();
        const box2 = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = lane.name;
        const info = document.createElement("div");
        info.textContent = `${lane.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · ${lane.length_km} km${lane.snapped === false ? " · traçado aproximado" : ""}`;
        box2.append(name, info);
        popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 8, className: "vdb-popup" })
          .setLngLat(e.lngLat)
          .setDOMContent(box2)
          .addTo(map);
      }
      if (pickRef.current.active && pickRef.current.cb) pickRef.current.cb(e.lngLat.lat, e.lngLat.lng);
      else onTapRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });
    // arrastar com o dedo/mouse = o usuário assumiu a câmera
    map.on("dragstart", () => {
      followRef.current = false;
      onUserPanRef.current?.();
    });
    map.on("movestart", (e) => {
      if (e.originalEvent) userMovingRef.current = true;
    });
    map.on("moveend", () => {
      userMovingRef.current = false;
    });
    // zoom afastado: placas menores para não cobrir o mapa
    const syncZoomClass = () => map.getContainer().classList.toggle("vdb-zoom-far", map.getZoom() < 14);
    syncZoomClass();
    map.on("zoom", syncZoomClass);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    mapRef.current = map;

    return () => {
      const anim = animRef.current;
      if (anim?.raf) cancelAnimationFrame(anim.raf);
      animRef.current = null;
      ro.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      setReady(false);
      markersRef.current.clear();
      shopMarkersRef.current = [];
      knownIdsRef.current = new Set();
      populatedRef.current = false;
      fittedRef.current = false;
      focusedRef.current = false;
      userMarkerRef.current = null;
      destMarkerRef.current = null;
      tapMarkerRef.current = null;
      curPosRef.current = null;
    };
  }, []);

  // ciclovias / ciclofaixas
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    laneByIdRef.current = new Map(bikeLanes.map((l) => [l.id, l]));
    setSource(
      "lanes",
      fc(
        bikeLanes.map((lane) => {
          // snapped === false: o servidor ainda não colou a ciclovia nas ruas (poucos pontos ligados em linha reta).
          // Desenha fraco e pontilhado em vez de um traço grosso e falso cortando quarteirões.
          const approx = lane.snapped === false;
          return lineFeature((lane.coordinates as [number, number][]).map(flip), {
            id: lane.id,
            color: lane.kind === "ciclovia" ? "#10B981" : "#38BDF8",
            dash: approx ? "approx" : lane.kind === "ciclofaixa" ? "faixa" : "solid",
          });
        }),
      ),
    );
    if (!fittedRef.current && bikeLanes.length > 0) {
      fittedRef.current = true;
      if (focusedRef.current) return;
      const own = bikeLanes.filter((l) => l.source !== "osm");
      const bounds = new maplibregl.LngLatBounds();
      for (const l of own.length > 0 ? own : bikeLanes) for (const p of l.coordinates as [number, number][]) bounds.extend(flip(p));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSource só lê refs
  }, [bikeLanes, ready]);

  // marcadores de obstáculos — atualização incremental (sem piscar a cada atualização de 6 s)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const onRoute = new Set(routeObstacleIds ?? []);
    obstacleByIdRef.current = new Map(obstacles.map((o) => [o.id, o]));
    const seen = new Set<string>();
    for (const o of obstacles) {
      seen.add(o.id);
      const sig = `${o.type}|${o.severity}|${onRoute.has(o.id) ? 1 : 0}`;
      const existing = markersRef.current.get(o.id);
      if (existing) {
        existing.marker.setLngLat([o.lng, o.lat]);
        if (existing.sig !== sig) {
          existing.el.innerHTML = obstacleHtml(o, onRoute.has(o.id));
          existing.sig = sig;
        }
      } else {
        const { marker, el } = htmlMarker(obstacleHtml(o, onRoute.has(o.id)), 44, 56, 22, 54, 20);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const fresh = obstacleByIdRef.current.get(o.id);
          if (fresh) onSelectRef.current?.(fresh);
        });
        marker.setLngLat([o.lng, o.lat]).addTo(map);
        markersRef.current.set(o.id, { marker, el, sig });

        // alerta reportado agora por alguém (não é a carga inicial nem um filtro reativado): anima a entrada
        if (populatedRef.current && !knownIdsRef.current.has(o.id)) {
          el.querySelector(".hz")?.classList.add("hz--new");
          window.setTimeout(() => el.querySelector(".hz")?.classList.remove("hz--new"), 4500);
        }
      }
      knownIdsRef.current.add(o.id);
    }
    for (const [id, entry] of markersRef.current) {
      if (!seen.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (obstacles.length > 0) populatedRef.current = true;
  }, [obstacles, routeObstacleIds, ready]);

  // traçado em desenho
  useEffect(() => {
    if (!ready) return;
    const pts = drawPoints ?? [];
    setSource("draw", fc(pts.length > 1 ? [lineFeature(pts.map(flip))] : []));
    setSource(
      "drawpts",
      fc(
        pts.map((p, i) => ({
          type: "Feature",
          properties: { first: i === 0 ? 1 : 0, end: i === 0 || i === pts.length - 1 ? 1 : 0 },
          geometry: { type: "Point", coordinates: flip(p) },
        })),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSource só lê refs
  }, [drawPoints, ready]);

  // borracharias e oficinas: recria só quando a lista muda (são poucas e quase não mudam)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const m of shopMarkersRef.current) m.remove();
    shopMarkersRef.current = (shops ?? []).map((shop) => {
      const { marker, el } = htmlMarker(shopHtml(shop), 34, 46, 17, 44, 10); // abaixo dos perigos: o alerta sempre fica por cima
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectShopRef.current?.(shop);
      });
      return marker.setLngLat([shop.lng, shop.lat]).addTo(map);
    });
  }, [shops, ready]);

  // nível de aproximação: a placa cresce e pulsa conforme o ciclista chega perto
  useEffect(() => {
    for (const [id, { el }] of markersRef.current) {
      const hz = el.querySelector(".hz");
      if (!hz) continue;
      const level = hazardLevels?.[id];
      hz.classList.toggle("hz--watch", level === "watch");
      hz.classList.toggle("hz--warn", level === "warn");
      hz.classList.toggle("hz--danger", level === "danger");
    }
  }, [hazardLevels, obstacles, routeObstacleIds, ready]);

  // linha tracejada do ciclista até o perigo principal à frente
  useEffect(() => {
    if (!ready) return;
    setSource("guide", fc(userPos && guideTo ? [lineFeature([[userPos.lng, userPos.lat], [guideTo.lng, guideTo.lat]])] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSource só lê refs
  }, [userPos, guideTo, ready]);

  // pino do ponto tocado
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (tapPoint) {
      if (!tapMarkerRef.current) {
        tapMarkerRef.current = htmlMarker(TAP_HTML, 32, 42, 16, 40, 90).marker.setLngLat([tapPoint.lng, tapPoint.lat]).addTo(map);
      } else {
        tapMarkerRef.current.setLngLat([tapPoint.lng, tapPoint.lat]);
      }
    } else if (tapMarkerRef.current) {
      tapMarkerRef.current.remove();
      tapMarkerRef.current = null;
    }
  }, [tapPoint, ready]);

  // rota de navegação + destino
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pts = (route ?? []) as [number, number][];
    setSource("route", fc(pts.length > 1 ? [lineFeature(pts.map(flip))] : []));

    if (destination) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = htmlMarker(DEST_HTML, 32, 42, 16, 40, 80).marker.setLngLat([destination.lng, destination.lat]).addTo(map);
      } else {
        destMarkerRef.current.setLngLat([destination.lng, destination.lat]);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSource só lê refs
  }, [route, destination, ready]);

  // enquadra a rota inteira na pré-visualização (acima do painel inferior)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !fitRoute || !route || route.length < 2) return;
    followRef.current = false;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of route) bounds.extend(flip(p));
    map.fitBounds(bounds, {
      padding: { top: 90, left: 30, right: 30, bottom: insetRef.current + 30 },
      maxZoom: 17,
      bearing: 0,
      pitch: 0,
      duration: 700,
    });
  }, [route, fitRoute, ready]);

  // ciclista: marcador com seta deitada sobre a rua, deslizando entre as leituras de GPS
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    if (!userPos) {
      const anim = animRef.current;
      if (anim?.raf) cancelAnimationFrame(anim.raf);
      animRef.current = null;
      curPosRef.current = null;
      userMarkerRef.current?.marker.remove();
      userMarkerRef.current = null;
      setSource("radar", EMPTY);
      return;
    }

    const target: LatLng = { lat: userPos.lat, lng: userPos.lng };
    if (!userMarkerRef.current) {
      const { marker, el } = htmlMarker(USER_HTML, 44, 44, 22, 22, 100, {
        // a seta fica "deitada" no mapa: acompanha a inclinação e o giro da câmera (efeito 3D)
        pitchAlignment: "map",
        rotationAlignment: "map",
      });
      marker.setLngLat([target.lng, target.lat]).addTo(map);
      userMarkerRef.current = { marker, el };
      curPosRef.current = target;
      setSource("radar", fc([circlePolygon(target, WARN_M)]));
      if (followRef.current) followCamera(target, 0, navigatingRef.current ? 17 : 16);
      return;
    }

    const prev = animRef.current;
    if (prev?.raf) cancelAnimationFrame(prev.raf);
    const anim = { from: curPosRef.current ?? target, to: target, t0: performance.now(), raf: null as number | null };
    animRef.current = anim;
    const tick = (now: number) => {
      const t = Math.min(1, (now - anim.t0) / POS_ANIM_MS);
      const cur: LatLng = {
        lat: anim.from.lat + (anim.to.lat - anim.from.lat) * t,
        lng: anim.from.lng + (anim.to.lng - anim.from.lng) * t,
      };
      curPosRef.current = cur;
      userMarkerRef.current?.marker.setLngLat([cur.lng, cur.lat]);
      setSource("radar", fc([circlePolygon(cur, WARN_M)]));
      anim.raf = t < 1 ? requestAnimationFrame(tick) : null;
    };
    anim.raf = requestAnimationFrame(tick);
    // a câmera desliza em paralelo, com a mesma duração e curva linear do marcador
    if (followRef.current) followCamera(target, POS_ANIM_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- followCamera/setSource só leem refs
  }, [userPos, ready]);

  // seta gira com o rumo; sem rumo conhecido mostra só o ponto
  useEffect(() => {
    const nav = userMarkerRef.current?.el.querySelector<HTMLElement>(".vdb-nav");
    if (!nav) return;
    if (typeof heading === "number" && Number.isFinite(heading)) {
      angleRef.current = nextAngle(angleRef.current, heading);
      nav.classList.remove("vdb-nav--still");
      nav.style.setProperty("--vdb-rot", `${angleRef.current}deg`);
    } else {
      nav.classList.add("vdb-nav--still");
    }
  }, [heading, userPos, ready]);

  // o anel de radar (raio de atenção) fica mais discreto durante a navegação guiada
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setPaintProperty("radar-line", "line-opacity", navigating ? 0.35 : 0.9);
    map.setPaintProperty("radar-fill", "fill-opacity", navigating ? 0.03 : 0.06);
  }, [navigating, ready]);

  // seguir o ciclista: ao ligar, voa até ele já com zoom de navegação; ao terminar a viagem, o mapa volta plano e ao norte
  const wasNavigatingRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    followRef.current = !!follow;
    const cur = curPosRef.current;
    if (follow && cur) followCamera(cur, 600, Math.max(map?.getZoom() ?? 0, navigating ? 17 : 16));
    if (wasNavigatingRef.current && !navigating && map) {
      map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: insetRef.current, left: 0, right: 0 }, duration: 700 });
    }
    wasNavigatingRef.current = !!navigating;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de follow/navigating
  }, [follow, navigating]);

  // modo "clique no mapa"
  useEffect(() => {
    pickRef.current.active = !!pickMode;
    pickRef.current.cb = onPick;
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode, onPick, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !ready || !map) return;
    followRef.current = false;
    focusedRef.current = true;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 16, duration: 800 });
  }, [focus, ready]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      data-testid="fortaleza-map"
      aria-label="Mapa cicloviário de Fortaleza"
    />
  );
}
