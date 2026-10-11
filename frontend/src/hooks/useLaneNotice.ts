import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { distToPolylineM } from "@/lib/geo";
import type { LatLng } from "@/lib/geo";
import type { BikeLane } from "@/lib/types";

const ENTER_M = 25; // GPS comum erra uns 10-20 m; menos que isso quase nunca dispara
const LEAVE_M = 60; // histerese: só "rearma" depois de sair daqui, evita pisca-pisca na borda
const COOLDOWN_MS = 5 * 60_000;

/** Avisa (toast + vibração) uma vez ao entrar numa ciclovia/ciclofaixa: "Você está na ciclofaixa: Rua X. Ande com cuidado." */
export function useLaneNotice(pos: LatLng | null, lanes: BikeLane[]) {
  const inside = useRef<string | null>(null);
  const lastAt = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!pos || lanes.length === 0) return;
    let best: BikeLane | null = null;
    let bestD = Infinity;
    for (const l of lanes) {
      const d = distToPolylineM(pos, l.coordinates);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (inside.current) {
      const cur = lanes.find((l) => l.id === inside.current);
      if (cur && distToPolylineM(pos, cur.coordinates) <= LEAVE_M) return; // ainda nela
      inside.current = null;
    }
    if (!best || bestD > ENTER_M) return;
    inside.current = best.id;
    const now = Date.now();
    if (now - (lastAt.current[best.id] ?? 0) < COOLDOWN_MS) return;
    lastAt.current[best.id] = now;
    navigator.vibrate?.([120]);
    toast.info(`Você está na ${best.kind}: ${best.name}. Ande com cuidado.`, { duration: 6000 });
  }, [pos, lanes]);
}
