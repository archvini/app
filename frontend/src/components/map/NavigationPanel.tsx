import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Bike,
  Check,
  Clock,
  Crosshair,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  FlagTriangleRight,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  Wrench,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistance, formatDuration } from "@/hooks/useNavigation";
import type { NavigationState } from "@/hooks/useNavigation";
import type { RideState } from "@/hooks/useRide";
import { SHOP_META } from "@/lib/shops";
import { OBSTACLE_TYPES, formatKm } from "@/lib/types";
import type { BikeLane, Obstacle, Place, RouteStep, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Horário previsto de chegada (HH:mm) a partir de agora + `seconds`. */
export function etaClock(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ManeuverIcon({ step, className }: { step: RouteStep | null; className?: string }) {
  if (!step) return <ArrowUp className={className} />;
  if (step.type === "arrive") return <Flag className={className} />;
  switch (step.modifier) {
    case "left":
    case "sharp left":
    case "uturn":
      return <CornerUpLeft className={className} />;
    case "right":
    case "sharp right":
      return <CornerUpRight className={className} />;
    case "slight left":
      return <ArrowUpLeft className={className} />;
    case "slight right":
      return <ArrowUpRight className={className} />;
    default:
      return <ArrowUp className={className} />;
  }
}

interface BannerProps {
  nav: NavigationState;
  ride: RideState;
}

/** Faixa superior durante a navegação: próxima manobra, distância e velocidade. Os perigos têm cartão próprio. */
export function ManeuverBanner({ nav, ride }: BannerProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900/92 px-3 py-3 shadow-2xl backdrop-blur-md"
      data-testid="nav-banner"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-[#022C22]">
        <ManeuverIcon step={nav.nextStep} className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-base font-bold text-white" data-testid="nav-instruction">
          {nav.nextStep ? nav.nextStep.instruction : "Siga a rota"}
        </p>
        <p className="text-xs text-slate-300">
          {nav.nextStep ? `em ${formatDistance(nav.distToNextM)}` : `${formatDistance(nav.remainingM)} até o destino`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xl font-bold leading-none text-white">{Math.round(ride.speedKmh)}</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">km/h</p>
      </div>
    </div>
  );
}

interface PanelProps {
  nav: NavigationState;
  ride: RideState;
  lanes: BikeLane[];
  /** posição do painel no encaixe (0 = recolhido) — mostra mais conteúdo quando expandido */
  sheetIndex: number;
  /** o que já existe no mapa, para a busca geral achar pelo nome */
  shops: Shop[];
  obstacles: Obstacle[];
  onPickShop: (s: Shop) => void;
  onPickObstacle: (o: Obstacle) => void;
  onPickLane: (l: BikeLane) => void;
  /** marca o lugar no mapa (abre o cartão: ir até lá, reportar aqui, adicionar local) */
  onPinPlace: (p: Place) => void;
  /** chamado ao digitar, para o painel abrir e mostrar os resultados */
  onSearchTyping: () => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Conteúdo do painel inferior: busca de destino → prévia da rota → chegada. Durante a viagem quem aparece é a bolha (NavBubble). */
export default function NavigationPanel({
  nav,
  ride,
  lanes,
  sheetIndex,
  shops,
  obstacles,
  onPickShop,
  onPickObstacle,
  onPickLane,
  onPinPlace,
  onSearchTyping,
}: PanelProps) {
  const [query, setQuery] = useState("");

  // busca geral: ruas e lugares (servidor) aparecem sozinhos depois de meio segundo sem digitar
  const { search } = nav;
  useEffect(() => {
    if (query.trim().length < 3) return;
    const t = setTimeout(() => void search(query, true), 500);
    return () => clearTimeout(t);
  }, [query, search]);

  // o que já existe no mapa com esse nome: locais, ciclovias e alertas (na hora, sem rede)
  const local = useMemo(() => {
    const n = norm(query.trim());
    if (n.length < 2) return { shops: [], lanes: [], alerts: [] };
    return {
      shops: shops.filter((x) => norm(`${x.name} ${SHOP_META[x.kind].label}`).includes(n)).slice(0, 3),
      lanes: lanes.filter((l) => norm(`${l.name} ${l.kind}`).includes(n)).slice(0, 3),
      alerts: obstacles.filter((o) => norm(`${OBSTACLE_TYPES[o.type].label} ${o.description}`).includes(n)).slice(0, 3),
    };
  }, [query, shops, lanes, obstacles]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void nav.search(query);
  };

  // ---- chegada ----
  if (nav.phase === "arrived") {
    return (
      <div className="space-y-3 text-center" data-testid="nav-arrived">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-[#022C22]">
          <Check className="h-7 w-7" />
        </span>
        <p className="font-heading text-lg font-bold text-white">Você chegou!</p>
        <p className="text-xs text-slate-400">{nav.destination?.name}</p>
        <Button className="w-full" onClick={nav.finish} data-testid="nav-finish">
          Concluir e salvar pedalada
        </Button>
      </div>
    );
  }

  // ---- prévia da rota ----
  if (nav.phase === "preview") {
    const alerts = nav.routeObstacleIds.length;
    return (
      <div className="space-y-3" data-testid="nav-preview">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destino</p>
            <p className="truncate font-heading text-base font-bold text-white">{nav.destination?.name}</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={nav.cancel} aria-label="Cancelar rota" data-testid="nav-cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {nav.loading || !nav.route ? (
          <p className="animate-pulse py-3 text-sm text-slate-400" data-testid="nav-loading">
            Traçando a melhor rota de bike…
          </p>
        ) : (
          <>
            <div className="flex items-end gap-4">
              <div>
                <p className="font-heading text-3xl font-bold text-white" data-testid="nav-eta">
                  {formatDuration(nav.route.duration_s)}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> chega às {etaClock(nav.route.duration_s)}
                </p>
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-slate-200">{formatKm(nav.route.distance_m / 1000)}</p>
                <p className="text-xs text-slate-400">distância</p>
              </div>
            </div>
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                alerts > 0
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
              )}
              data-testid="nav-route-alerts"
            >
              {alerts > 0 ? <TriangleAlert className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
              {alerts > 0 ? `${alerts} alerta(s) de obstáculo no caminho` : "Nenhum alerta de obstáculo no caminho"}
            </p>
            {nav.route.source === "straight" && (
              <p className="text-xs text-amber-300">
                O roteador de bike está indisponível — a linha é reta e não segue as ruas.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => nav.start(false)} data-testid="nav-start">
                <Navigation className="h-4 w-4" /> Iniciar
              </Button>
              <Button variant="outline" onClick={() => nav.start(true)} data-testid="nav-simulate">
                <Zap className="h-4 w-4" /> Simular
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- sem destino: busca ----
  return (
    <div className="space-y-4" data-testid="nav-search-panel">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length >= 2) onSearchTyping();
            }}
            placeholder="Buscar rua, avenida, lugar, borracharia…"
            className="h-10 pl-8"
            data-testid="nav-search-input"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit" size="lg" disabled={nav.searching} data-testid="nav-search-submit">
          {nav.searching ? "…" : "Buscar"}
        </Button>
      </form>

      {(local.shops.length > 0 || local.lanes.length > 0 || local.alerts.length > 0) && (
        <ul className="space-y-1" data-testid="nav-local-results">
          {local.shops.map((x) => (
            <ResultRow key={x.id} icon={<Wrench className="h-4 w-4" />} tone="bg-sky-500/15 text-sky-300" title={x.name} sub={SHOP_META[x.kind].label} onClick={() => onPickShop(x)} />
          ))}
          {local.lanes.map((l) => (
            <ResultRow key={l.id} icon={<RouteIcon className="h-4 w-4" />} tone="bg-emerald-500/15 text-emerald-300" title={l.name} sub={l.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} onClick={() => onPickLane(l)} />
          ))}
          {local.alerts.map((o) => (
            <ResultRow key={o.id} icon={<FlagTriangleRight className="h-4 w-4" />} tone="bg-orange-500/15 text-orange-300" title={OBSTACLE_TYPES[o.type].label} sub={o.description || "Alerta no mapa"} onClick={() => onPickObstacle(o)} />
          ))}
        </ul>
      )}

      {nav.places.length > 0 && (
        <ul className="space-y-1" data-testid="nav-results">
          {nav.places.map((p) => (
            <li key={`${p.lat}-${p.lng}`} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nav.chooseDestination({ lat: p.lat, lng: p.lng, name: p.name || p.label })}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{p.name || p.label}</span>
                  <span className="block truncate text-xs text-slate-500">{p.label}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onPinPlace(p)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Ver no mapa (reportar ou adicionar local aqui)"
                title="Ver no mapa: reportar ou adicionar local aqui"
              >
                <Crosshair className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Dica: <strong className="text-slate-300">toque no mapa</strong> para escolher o destino ali ou reportar um perigo.
      </p>

      {sheetIndex > 0 && (
        <>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Ciclovias de Fortaleza</p>
            <ul className="space-y-1">
              {lanes.filter((l) => l.source !== "osm").slice(0, 15).map((l) => {
                const end = l.coordinates[l.coordinates.length - 1];
                if (!end) return null;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => nav.chooseDestination({ lat: end[0], lng: end[1], name: l.name })}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
                      data-testid={`nav-lane-${l.id}`}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          l.kind === "ciclovia" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300",
                        )}
                      >
                        <RouteIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{l.name}</span>
                        <span className="block text-xs text-slate-500">
                          {l.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · {formatKm(l.length_km)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bike className="h-4 w-4 text-emerald-400" /> Pedal livre
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {ride.riding
                ? `${Math.round(ride.speedKmh)} km/h · ${formatKm(ride.sessionKm)} no pedal`
                : "Registra seus km e avisa de perigos num raio de 500 m, sem destino."}
            </p>
            <Button
              size="sm"
              className="mt-2 w-full"
              variant={ride.riding ? "destructive" : "default"}
              onClick={ride.toggle}
              data-testid="free-ride-toggle"
            >
              {ride.riding ? "Encerrar pedal" : "Iniciar pedal livre"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ResultRow({ icon, tone, title, sub, onClick }: { icon: React.ReactNode; tone: string; title: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone)}>{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{title}</span>
          <span className="block truncate text-xs text-slate-500">{sub}</span>
        </span>
      </button>
    </li>
  );
}
