import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { toast } from "sonner";

import { ApiError, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { formatKm, haversine } from "@/lib/types";
import type { BikeLane, RideResult } from "@/lib/types";

export interface RidePos {
  lat: number;
  lng: number;
}

export interface RideState {
  riding: boolean;
  demo: boolean;
  pos: RidePos | null;
  /** direção do deslocamento em graus (0 = norte, sentido horário); null enquanto não houver movimento */
  heading: number | null;
  speedKmh: number;
  sessionKm: number;
  toggle: () => void;
  startDemo: (lane: BikeLane) => void;
  /** simula um pedal ao longo de qualquer polilinha [lat, lng] (ex.: a rota de navegação) */
  startRoute: (coords: [number, number][]) => void;
  stop: () => void;
}

/** Rumo inicial (graus, 0 = norte) de a para b. */
export function bearing(a: RidePos, b: RidePos): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Beep de proximidade — só dispara depois de um gesto do usuário (ligar o GPS), então o autoplay passa.
 * `warn` = um tom duplo suave; `danger` = três tons agudos e mais altos, impossíveis de confundir.
 */
export function playAlertBeep(level: "warn" | "danger" = "warn"): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    const tones: [number, number][] =
      level === "danger"
        ? [
            [1175, 0],
            [1175, 0.18],
            [1175, 0.36],
          ]
        : [
            [880, 0],
            [660, 0.15],
          ];
    const peak = level === "danger" ? 0.14 : 0.08;
    for (const [freq, at] of tones) {
      const osc = ctx.createOscillator();
      osc.type = level === "danger" ? "square" : "sine";
      osc.frequency.setValueAtTime(freq, t0 + at);
      osc.connect(gain);
      gain.gain.setValueAtTime(peak, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.14);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.15);
    }
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // áudio bloqueado — o alerta visual segue
  }
}

/** Jingle de chegada: arpejo ascendente (dó-mi-sol-dó) em tom suave, terminando num acorde longo. Alegre, curto (~1 s). */
export function playArrivalSound(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const notes: [number, number, number][] = [
      [523.25, 0, 0.16],
      [659.25, 0.16, 0.16],
      [783.99, 0.32, 0.16],
      [1046.5, 0.48, 0.7], // dó agudo sustentado
      [659.25, 0.48, 0.7],
      [783.99, 0.48, 0.7],
    ];
    for (const [freq, at, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0 + at);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // áudio bloqueado — o aviso visual segue
  }
}

/** Rastreio de pedalada: GPS real (watchPosition) + rota demo interpolada. Registra km no servidor ao encerrar. */
export function useRide() {
  const [riding, setRiding] = useState(false);
  const [demo, setDemo] = useState(false);
  const [pos, setPos] = useState<RidePos | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [sessionKm, setSessionKm] = useState(0);
  // posição "de passeio": o ponto azul aparece assim que o app abre, antes de iniciar qualquer pedal
  const [here, setHere] = useState<RidePos | null>(null);
  const [hereHeading, setHereHeading] = useState<number | null>(null);

  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const kmRef = useRef(0);
  const ridingRef = useRef(false);

  const logRide = useCallback(async (km: number) => {
    const rounded = Math.round(km * 100) / 100;
    if (rounded < 0.05) return;
    try {
      const res = await apiPost<RideResult>("/rides", { km: rounded });
      toast.success(`Pedalada registrada: ${formatKm(rounded)} · +${Math.round(rounded * 10)} XP`);
      for (const b of res.new_badges) {
        toast.success(`Novo selo desbloqueado: ${b.name}`, { description: b.desc });
        confetti({ particleCount: 130, spread: 75, origin: { y: 0.7 }, colors: ["#10B981", "#F97316", "#FBBF24"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.info("Faça login para salvar suas pedaladas e ganhar XP");
      }
    }
  }, []);

  const clearTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTracking();
    ridingRef.current = false;
    setRiding(false);
    setDemo(false);
    setSpeedKmh(0);
    lastRef.current = null;
    const km = kmRef.current;
    kmRef.current = 0;
    if (km > 0.05) void logRide(km);
  }, [clearTracking, logRide]);

  const onPos = useCallback((p: { lat: number; lng: number; acc: number; heading?: number | null }) => {
    const now = Date.now();
    const last = lastRef.current;
    if (last) {
      const d = haversine(last, p);
      const dt = (now - last.t) / 1000;
      if (p.acc < 50 && d > 4 && dt > 0) {
        kmRef.current += d / 1000;
        setSessionKm(kmRef.current);
        setSpeedKmh((d / dt) * 3.6);
        setHeading(bearing(last, p));
      } else if (typeof p.heading === "number" && Number.isFinite(p.heading)) {
        // parado ou deslocamento mínimo: usa a bússola/rumo informado pelo aparelho, se houver
        setHeading(p.heading);
      }
    }
    lastRef.current = { lat: p.lat, lng: p.lng, t: now };
    setPos({ lat: p.lat, lng: p.lng });
  }, []);

  const toggle = useCallback(() => {
    if (ridingRef.current) {
      stop();
      return;
    }
    if (!("geolocation" in navigator)) {
      toast.error("Este navegador não tem GPS disponível");
      return;
    }
    ridingRef.current = true;
    setRiding(true);
    setDemo(false);
    playAlertBeep();
    watchRef.current = navigator.geolocation.watchPosition(
      (p) =>
        onPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy,
          heading: p.coords.heading,
        }),
      () => {
        toast.error("Não foi possível obter sua localização");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  }, [onPos, stop]);

  /** Simula um pedal de ~18 km/h ao longo de uma polilinha [lat, lng] — útil para demonstrar alertas e a navegação sem sair do lugar. */
  const startRoute = useCallback(
    (pts: [number, number][]) => {
      if (ridingRef.current) stop();
      if (pts.length < 2) return;
      ridingRef.current = true;
      setRiding(true);
      setDemo(true);
      playAlertBeep();

      const cum: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(
          cum[i - 1] +
            haversine({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }),
        );
      }
      const total = cum[cum.length - 1];
      if (total <= 0) return;

      const SPEED_MS = 5; // 18 km/h, tick de 1s
      let traveled = 0;
      lastRef.current = null;
      timerRef.current = setInterval(() => {
        traveled += SPEED_MS;
        if (traveled >= total) {
          const end = pts[pts.length - 1];
          setPos({ lat: end[0], lng: end[1] });
          stop();
          return;
        }
        let i = 1;
        while (i < cum.length - 1 && cum[i] < traveled) i++;
        const segStart = cum[i - 1];
        const segLen = cum[i] - segStart;
        const f = segLen > 0 ? (traveled - segStart) / segLen : 0;
        onPos({
          lat: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
          lng: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
          acc: 5,
        });
      }, 1000);
    },
    [onPos, stop],
  );

  const startDemo = useCallback((lane: BikeLane) => startRoute(lane.coordinates), [startRoute]);

  // voltou do segundo plano (trocou de app e retornou): o navegador pode ter pausado o GPS — pede a posição atual na hora
  useEffect(() => {
    if (!riding || demo) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (p) => onPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, heading: p.coords.heading }),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
      );
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [riding, demo, onPos]);

  // Localização ao vivo fora do pedal: não conta km nem dispara alertas. Para sozinha com o app em segundo plano
  // (economiza bateria) e se o usuário negar a permissão (sem insistir).
  useEffect(() => {
    if (riding || !("geolocation" in navigator)) return;
    let id: number | null = null;
    let denied = false;
    const start = () => {
      if (id !== null || denied) return;
      id = navigator.geolocation.watchPosition(
        (p) => {
          setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
          setHereHeading(typeof p.coords.heading === "number" && Number.isFinite(p.coords.heading) ? p.coords.heading : null);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            denied = true;
            halt();
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    };
    const halt = () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
      id = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : halt());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      halt();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [riding]);

  useEffect(
    () => () => {
      // desmontagem: apenas limpa rastreio (registro de km só em stop explícito)
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  // pedalando: a posição do pedal; parado: a localização atual do aparelho (se houver)
  const state: RideState = {
    riding,
    demo,
    pos: riding ? pos : (here ?? pos),
    heading: riding ? heading : hereHeading,
    speedKmh,
    sessionKm,
    toggle,
    startDemo,
    startRoute,
    stop,
  };
  return state;
}
