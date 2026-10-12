import { useEffect, useMemo, useRef, useState } from "react";
import { Bike, FlagTriangleRight, Loader2, MapPin, Search, Spline, Wrench, X } from "lucide-react";

import { apiGet } from "@/lib/api";
import { SHOP_META } from "@/lib/shops";
import { OBSTACLE_TYPES } from "@/lib/types";
import type { BikeLane, Obstacle, Place, Shop } from "@/lib/types";

interface Props {
  obstacles: Obstacle[];
  shops: Shop[];
  lanes: BikeLane[];
  onPlace: (p: Place) => void;
  onShop: (s: Shop) => void;
  onLane: (l: BikeLane) => void;
  onObstacle: (o: Obstacle) => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca no topo do mapa. Mostra na hora o que já temos (locais, ciclovias, alertas) e, a partir de 3 letras,
 * consulta endereços/lugares de Fortaleza no servidor (/geocode). Escolher um endereço abre o cartão "ir até aqui /
 * reportar / adicionar local" nesse ponto.
 */
export default function MapSearchBar({ obstacles, shops, lanes, onPlace, onShop, onLane, onObstacle }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  // endereços: espera o usuário parar de digitar (0,5 s) para não encher o servidor de buscas
  useEffect(() => {
    const query = q.trim();
    const my = ++seq.current;
    if (query.length < 3) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      apiGet<Place[]>(`/geocode?q=${encodeURIComponent(query)}`)
        .then((r) => my === seq.current && setPlaces(r.slice(0, 5)))
        .catch(() => my === seq.current && setPlaces([]))
        .finally(() => my === seq.current && setLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [q]);

  const local = useMemo(() => {
    const n = norm(q.trim());
    if (n.length < 2) return { shops: [], lanes: [], alerts: [] };
    return {
      shops: shops.filter((s) => norm(`${s.name} ${SHOP_META[s.kind].label}`).includes(n)).slice(0, 3),
      lanes: lanes.filter((l) => norm(`${l.name} ${l.kind}`).includes(n)).slice(0, 3),
      alerts: obstacles
        .filter((o) => norm(`${OBSTACLE_TYPES[o.type].label} ${o.description}`).includes(n))
        .slice(0, 3),
    };
  }, [q, shops, lanes, obstacles]);

  const close = () => {
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const pick = (fn: () => void) => {
    fn();
    close();
  };

  const empty = places.length + local.shops.length + local.lanes.length + local.alerts.length === 0;
  const showList = open && q.trim().length >= 2;

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      data-testid="map-search"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur-md">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder="Buscar rua, lugar, borracharia, ciclovia…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          aria-label="Buscar no mapa"
          data-testid="map-search-input"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Limpar busca" className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-700/70 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md"
          data-testid="map-search-results"
        >
          {places.map((p, i) => (
            <Row key={`p${i}`} icon={<MapPin className="h-4 w-4 text-emerald-400" />} title={p.name} sub={p.label} onClick={() => pick(() => onPlace(p))} />
          ))}
          {local.shops.map((s) => (
            <Row
              key={s.id}
              icon={s.kind === "bicicletar" ? <Bike className="h-4 w-4 text-amber-400" /> : <Wrench className="h-4 w-4 text-sky-400" />}
              title={s.name}
              sub={SHOP_META[s.kind].label}
              onClick={() => pick(() => onShop(s))}
            />
          ))}
          {local.lanes.map((l) => (
            <Row key={l.id} icon={<Spline className="h-4 w-4 text-emerald-400" />} title={l.name} sub={l.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} onClick={() => pick(() => onLane(l))} />
          ))}
          {local.alerts.map((o) => (
            <Row
              key={o.id}
              icon={<FlagTriangleRight className="h-4 w-4 text-orange-400" />}
              title={OBSTACLE_TYPES[o.type].label}
              sub={o.description || "Alerta no mapa"}
              onClick={() => pick(() => onObstacle(o))}
            />
          ))}
          {empty && !loading && <li className="px-3 py-3 text-xs text-slate-400">Nada encontrado. Tente outro nome ou toque no mapa para marcar o ponto.</li>}
        </ul>
      )}
    </div>
  );
}

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-800">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{title}</span>
          <span className="block truncate text-xs text-slate-400">{sub}</span>
        </span>
      </button>
    </li>
  );
}
