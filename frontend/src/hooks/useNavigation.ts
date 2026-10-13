import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { RideState } from "@/hooks/useRide";
import { apiDetail, apiGet } from "@/lib/api";
import { haversine } from "@/lib/types";
import type { Obstacle, Place, RouteResult, RouteStep } from "@/lib/types";

export interface Destination {
  lat: number;
  lng: number;
  name: string;
}

/** idle = sem destino · preview = rota traçada, aguardando "Iniciar" · navigating = guiando · arrived = chegou */
export type NavPhase = "idle" | "preview" | "navigating" | "arrived";

const OFF_ROUTE_M = 70; // distância da rota a partir da qual recalculamos
const ARRIVE_M = 30; // raio de chegada
const REROUTE_COOLDOWN_MS = 10_000;
const ROUTE_ALERT_RADIUS_M = 40; // obstáculo "no caminho" = a até 40 m da rota
/** Ponto de partida de exemplo (início da ciclovia da Beira-Mar) quando o aparelho não tem GPS/permissão. */
const FALLBACK_ORIGIN = { lat: -3.7215, lng: -38.516 };

type LatLngTuple = [number, number];

const TRIP_KEY = "vdb_trip";
const TRIP_MAX_AGE_MS = 3 * 60 * 60 * 1000; // viagem guardada vale por 3 h

export interface SavedTrip {
  destination: { lat: number; lng: number; name: string };
  savedAt: number;
}

/** Viagem que estava em andamento quando o app foi fechado/recarregado pelo sistema (ou null). */
export function readSavedTrip(): SavedTrip | null {
  try {
    const raw = localStorage.getItem(TRIP_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as SavedTrip;
    if (!t?.destination || Date.now() - t.savedAt > TRIP_MAX_AGE_MS) {
      localStorage.removeItem(TRIP_KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function clearSavedTrip(): void {
  try {
    localStorage.removeItem(TRIP_KEY);
  } catch {
    // armazenamento bloqueado: sem retomada, o resto funciona
  }
}

function cumulative(coords: LatLngTuple[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(
      cum[i - 1] +
        haversine({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }),
    );
  }
  return cum;
}

interface Located {
  idx: number; // segmento [idx, idx+1] mais próximo
  along: number; // metros percorridos desde o início da rota até a projeção
  off: number; // distância (m) do ponto à rota
}

/** Projeta `p` na polilinha (plano local — suficiente em escala de cidade). */
function locate(coords: LatLngTuple[], cum: number[], p: { lat: number; lng: number }): Located {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let best: Located = { idx: 0, along: 0, off: Number.POSITIVE_INFINITY };
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][1] - p.lng) * kx;
    const ay = (coords[i][0] - p.lat) * ky;
    const bx = (coords[i + 1][1] - p.lng) * kx;
    const by = (coords[i + 1][0] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.off) best = { idx: i, along: cum[i] + t * (cum[i + 1] - cum[i]), off: d };
  }
  return best;
}

/** Quantos obstáculos ativos ficam a até `radiusM` da rota. */
function obstaclesNearRoute(coords: LatLngTuple[], cum: number[], obstacles: Obstacle[], radiusM: number): string[] {
  if (coords.length < 2) return [];
  return obstacles
    .filter((o) => o.status !== "resolvido" && locate(coords, cum, { lat: o.lat, lng: o.lng }).off <= radiusM)
    .map((o) => o.id);
}

/**
 * Navegação estilo Uber/99 para ciclistas: busca de destino, rota por ruas, guia passo a passo,
 * ETA, recálculo ao sair da rota e aviso de chegada. A posição vem do `useRide` (GPS real ou simulação).
 */
export function useNavigation(ride: RideState, obstacles: Obstacle[]) {
  const { pos, riding, toggle, stop, startRoute } = ride;

  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [phase, setPhase] = useState<NavPhase>("idle");
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  const reqRef = useRef(0); // descarta respostas de pedidos antigos
  const lastRerouteRef = useRef(0);
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const getOrigin = useCallback(async (): Promise<{ lat: number; lng: number; real: boolean }> => {
    if (posRef.current) return { ...posRef.current, real: true };
    if ("geolocation" in navigator) {
      try {
        const p = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 7000,
            maximumAge: 15000,
          }),
        );
        return { lat: p.coords.latitude, lng: p.coords.longitude, real: true };
      } catch {
        // sem permissão/sinal: cai no ponto de exemplo
      }
    }
    return { ...FALLBACK_ORIGIN, real: false };
  }, []);

  const planRoute = useCallback(
    async (dest: Destination, opts?: { silent?: boolean; origin?: { lat: number; lng: number } }) => {
      const req = ++reqRef.current;
      setLoading(true);
      try {
        let origin = opts?.origin;
        let real = true;
        if (!origin) {
          const g = await getOrigin();
          origin = { lat: g.lat, lng: g.lng };
          real = g.real;
        }
        if (!real && !opts?.silent) {
          toast.info("Sem GPS — usando um ponto de partida de exemplo na Beira-Mar");
        }
        const qs = new URLSearchParams({
          from_lat: String(origin.lat),
          from_lng: String(origin.lng),
          to_lat: String(dest.lat),
          to_lng: String(dest.lng),
        });
        const r = await apiGet<RouteResult>(`/route?${qs.toString()}`);
        if (req !== reqRef.current) return null;
        setRoute(r);
        if (r.source === "straight" && !opts?.silent) {
          toast.warning("Roteador de bike indisponível agora — mostrando linha reta até o destino");
        }
        return r;
      } catch (err) {
        if (req === reqRef.current) toast.error(apiDetail(err, "Não foi possível traçar a rota agora"));
        return null;
      } finally {
        if (req === reqRef.current) setLoading(false);
      }
    },
    [getOrigin],
  );

  const searchSeq = useRef(0); // ignora respostas atrasadas quando o usuário já digitou outra coisa
  /** `silent` = busca automática enquanto digita: sem avisos de "digite mais letras" ou "nada encontrado". */
  const search = useCallback(async (q: string, silent = false) => {
    const query = q.trim();
    if (query.length < 3) {
      if (!silent) toast.info("Digite pelo menos 3 letras para buscar");
      return;
    }
    const my = ++searchSeq.current;
    setSearching(true);
    try {
      const res = await apiGet<Place[]>(`/geocode?q=${encodeURIComponent(query)}`);
      if (my !== searchSeq.current) return;
      setPlaces(res);
      if (res.length === 0 && !silent) toast.info("Nenhum lugar encontrado em Fortaleza para essa busca");
    } catch (err) {
      if (!silent && my === searchSeq.current) toast.error(apiDetail(err, "Busca indisponível agora"));
    } finally {
      if (my === searchSeq.current) setSearching(false);
    }
  }, []);

  const chooseDestination = useCallback(
    (dest: Destination) => {
      setDestination(dest);
      setRoute(null);
      setPlaces([]);
      setPhase("preview");
      void planRoute(dest);
    },
    [planRoute],
  );

  /** simulate = percorre a rota virtualmente (útil sem GPS/para testar); senão usa o GPS real. */
  const start = useCallback(
    (simulate: boolean) => {
      if (!route) return;
      setPhase("navigating");
      if (simulate) startRoute(route.coordinates);
      else if (!riding) toggle();
    },
    [route, riding, toggle, startRoute],
  );

  const cancel = useCallback(() => {
    reqRef.current++;
    setLoading(false);
    setPhase("idle");
    setDestination(null);
    setRoute(null);
    setPlaces([]);
  }, []);

  /** Encerra a navegação e o pedal (os km viram XP). */
  const finish = useCallback(() => {
    if (riding) stop();
    cancel();
  }, [riding, stop, cancel]);

  // ---- progresso ao longo da rota ----
  const coords = route?.coordinates;
  const cum = useMemo(() => (coords ? cumulative(coords) : []), [coords]);
  const totalM = cum.length > 0 ? cum[cum.length - 1] : 0;

  const stepAlong = useMemo(() => {
    if (!coords || coords.length === 0 || !route) return [] as number[];
    return route.steps.map((s) => {
      let bestI = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < coords.length; i++) {
        const d = haversine({ lat: s.lat, lng: s.lng }, { lat: coords[i][0], lng: coords[i][1] });
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      return cum[bestI];
    });
  }, [route, coords, cum]);

  const progress = useMemo(() => {
    if (!coords || coords.length < 2 || !pos || phase === "idle" || phase === "preview") return null;
    return locate(coords, cum, pos);
  }, [coords, cum, pos, phase]);

  const remainingM = progress && totalM > 0 ? Math.max(0, totalM - progress.along) : (route?.distance_m ?? 0);
  const remainingS =
    route && totalM > 0 ? Math.round(route.duration_s * (remainingM / totalM)) : (route?.duration_s ?? 0);

  let nextStep: RouteStep | null = null;
  let distToNextM = 0;
  if (route && progress) {
    for (let i = 0; i < route.steps.length; i++) {
      const s = route.steps[i];
      if (s.type === "depart") continue;
      if (stepAlong[i] > progress.along + 5) {
        nextStep = s;
        distToNextM = stepAlong[i] - progress.along;
        break;
      }
    }
  }

  // trecho que ainda falta percorrer (a linha "some" atrás do ciclista, como nos apps de corrida)
  const remainingCoords = useMemo<LatLngTuple[] | null>(() => {
    if (!coords) return null;
    if (!progress || !pos) return coords;
    return [[pos.lat, pos.lng], ...coords.slice(progress.idx + 1)];
  }, [coords, progress, pos]);

  const routeObstacleIds = useMemo(
    () => (coords ? obstaclesNearRoute(coords, cum, obstacles, ROUTE_ALERT_RADIUS_M) : []),
    [coords, cum, obstacles],
  );

  // guarda o destino enquanto guia: se o celular matar o app em segundo plano, dá para retomar ao reabrir
  useEffect(() => {
    if (phase === "navigating" && destination) {
      try {
        localStorage.setItem(TRIP_KEY, JSON.stringify({ destination, savedAt: Date.now() } satisfies SavedTrip));
      } catch {
        // ignora
      }
    } else if (phase === "idle" || phase === "arrived") {
      clearSavedTrip();
    }
  }, [phase, destination]);

  // chegada
  useEffect(() => {
    if (phase === "navigating" && progress && remainingM < ARRIVE_M) {
      setPhase("arrived");
      toast.success("Você chegou ao destino!");
    }
  }, [phase, progress, remainingM]);

  // saiu da rota → recalcula a partir da posição atual (com intervalo mínimo entre tentativas)
  const offRoute = phase === "navigating" && !!progress && progress.off > OFF_ROUTE_M;
  useEffect(() => {
    if (!offRoute || !destination || !posRef.current) return;
    const now = Date.now();
    if (now - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;
    lastRerouteRef.current = now;
    toast.info("Recalculando a rota…");
    void planRoute(destination, { silent: true, origin: posRef.current });
  }, [offRoute, destination, planRoute]);

  return {
    phase,
    destination,
    route,
    loading,
    places,
    searching,
    search,
    chooseDestination,
    start,
    cancel,
    finish,
    remainingM,
    remainingS,
    nextStep,
    distToNextM,
    remainingCoords,
    routeObstacleIds,
    offRoute,
  };
}

export type NavigationState = ReturnType<typeof useNavigation>;

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
