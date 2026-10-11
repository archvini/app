import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Bike, FlagTriangleRight, Layers, LocateFixed, Navigation, Pencil, Volume2, VolumeX, Wrench, X } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import BottomSheet from "@/components/map/BottomSheet";
import FortalezaMap from "@/components/map/FortalezaMap";
import type { FocusRequest } from "@/components/map/FortalezaMap";
import HazardAlertCard from "@/components/map/HazardAlertCard";
import HazardIcon from "@/components/map/HazardIcon";
import MapHud from "@/components/map/MapHud";
import LaneEditor from "@/components/map/LaneEditor";
import type { EditorMode } from "@/components/map/LaneEditor";
import PhotoStrip from "@/components/map/PhotoStrip";
import NavBubble from "@/components/map/NavBubble";
import NavigationPanel, { ManeuverBanner } from "@/components/map/NavigationPanel";
import ReportObstacleModal from "@/components/map/ReportObstacleModal";
import ShopCard from "@/components/map/ShopCard";
import SuggestShopModal from "@/components/map/SuggestShopModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useHazardWatch } from "@/hooks/useHazardWatch";
import { useLaneNotice } from "@/hooks/useLaneNotice";
import { clearSavedTrip, readSavedTrip, useNavigation } from "@/hooks/useNavigation";
import type { SavedTrip } from "@/hooks/useNavigation";
import { useWakeLock } from "@/hooks/useWakeLock";
import type { NavPhase } from "@/hooks/useNavigation";
import { useRide } from "@/hooks/useRide";
import { apiDelete, apiDetail, apiGet, apiPost } from "@/lib/api";
import { OBSTACLE_TYPES, SEVERITY_LABELS } from "@/lib/types";
import type { BikeLane, Obstacle, ObstacleType, ReportResult, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_TYPES = Object.keys(OBSTACLE_TYPES) as ObstacleType[];

/** Alturas (px) de encaixe do painel inferior em cada fase da navegação. */
const SHEET_SNAPS: Record<NavPhase, number[]> = {
  idle: [150, 340, 560],
  preview: [280, 420],
  navigating: [170, 400],
  arrived: [240],
};

const SWIPE_DISMISS_PX = 70;

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const { data: user } = useAuth();
  const queryClient = useQueryClient();

  const { data: lanes = [] } = useQuery({
    queryKey: ["bikelanes"],
    queryFn: () => apiGet<BikeLane[]>("/bikelanes"),
  });
  const { data: obstacles = [] } = useQuery({
    queryKey: ["obstacles"],
    queryFn: () => apiGet<Obstacle[]>("/obstacles"),
    refetchInterval: 6000, // perigos novos aparecem no mapa quase em tempo real
  });

  const { data: shops = [] } = useQuery({
    queryKey: ["shops"],
    queryFn: () => apiGet<Shop[]>("/shops"),
    refetchInterval: 120000,
  });
  // conta dev: desenhar/apagar ciclovias e ciclofaixas
  const [editorMode, setEditorMode] = useState<EditorMode>("off");
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [eraseTarget, setEraseTarget] = useState<BikeLane | null>(null);
  const [showShops, setShowShops] = useState(true);
  const [showBikeShare, setShowBikeShare] = useState(true);
  const visibleShops = useMemo(
    () => shops.filter((s) => (s.kind === "bicicletar" ? showBikeShare : showShops)),
    [shops, showShops, showBikeShare],
  );
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestCoords, setSuggestCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [typeFilter, setTypeFilter] = useState<Set<ObstacleType>>(new Set(ALL_TYPES));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Obstacle | null>(null);
  const [tapPoint, setTapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [follow, setFollow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [inset, setInset] = useState(0); // px do rodapé do mapa até o topo do painel inferior
  const [cardDy, setCardDy] = useState(0); // arrasto do cartão do alerta (deslizar para baixo fecha)
  const autoReportRef = useRef(false);
  const cardDragRef = useRef<number | null>(null);

  const ride = useRide();

  // ?lat=&lng= chega da caixa de alertas ("Ver no mapa"): abre centralizado no ponto
  useEffect(() => {
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    if (searchParams.get("lat") && searchParams.get("lng") && Number.isFinite(lat) && Number.isFinite(lng)) {
      setFocus({ lat, lng, zoom: 18 });
    }
  }, [searchParams]);

  // ?report=1 chega do botão "Reportar" da navbar
  useEffect(() => {
    if (searchParams.get("report") === "1" && !autoReportRef.current) {
      autoReportRef.current = true;
      setPickMode(true);
      toast.info("Toque no mapa para marcar onde está o obstáculo");
    }
  }, [searchParams]);

  const filtered = useMemo(() => obstacles.filter((o) => typeFilter.has(o.type)), [obstacles, typeFilter]);

  const nav = useNavigation(ride, filtered);
  const phase = nav.phase;

  // tela ligada durante a viagem; e, se o sistema fechou o app em segundo plano, oferece retomar o trajeto
  useWakeLock(ride.riding || phase === "navigating");
  const [savedTrip, setSavedTrip] = useState<SavedTrip | null>(() => readSavedTrip());
  const resumeTrip = () => {
    if (!savedTrip) return;
    nav.chooseDestination(savedTrip.destination);
    setSavedTrip(null);
    toast.info("Rota recalculada. Toque em Iniciar para continuar a viagem.");
  };
  const dismissSavedTrip = () => {
    clearSavedTrip();
    setSavedTrip(null);
  };

  // radar de perigos: distância/direção em tempo real, aviso por som, voz e vibração a cada nível
  const watch = useHazardWatch({ ride, obstacles: filtered, lanes, soundOn });
  const { primary, dismiss } = watch;
  useLaneNotice(ride.pos, lanes); // "você está na ciclofaixa..."

  // câmera acompanha o ciclista enquanto pedala/navega; arrastar o mapa solta a câmera (botão "recentralizar" volta)
  useEffect(() => {
    setFollow(ride.riding || phase === "navigating");
  }, [ride.riding, phase]);

  // cada fase começa com o painel no menor encaixe; resultados de busca abrem o painel
  useEffect(() => {
    setSheetIndex(0);
  }, [phase]);
  useEffect(() => {
    if (nav.places.length > 0) setSheetIndex((i) => Math.max(i, 1));
  }, [nav.places]);

  const focusPrimary = useCallback(() => {
    if (!primary) return;
    setFollow(false);
    setFocus({ lat: primary.obstacle.lat, lng: primary.obstacle.lng, zoom: 17 });
  }, [primary]);

  const demoLane = useMemo(() => lanes.find((l) => l.id === "beira-mar") ?? lanes[0] ?? null, [lanes]);
  const handleStartDemo = useCallback(() => {
    if (!demoLane) return;
    ride.startDemo(demoLane);
    toast.info(`Rota demo: ${demoLane.name}`);
  }, [demoLane, ride]);

  const onPick = useCallback((lat: number, lng: number) => {
    if (editorMode === "draw") {
      setDrawPoints((p) => [...p, [lat, lng]]);
      return;
    }
    setPickMode(false);
    setReportCoords({ lat, lng });
    setModalOpen(true);
  }, [editorMode]);

  const onSelectShop = useCallback((shop: Shop) => {
    setTapPoint(null);
    setSelected(null);
    setSelectedShop(shop);
    setFollow(false);
    setFocus({ lat: shop.lat, lng: shop.lng, zoom: 17 });
  }, []);

  const onSelectObstacle = useCallback((o: Obstacle) => {
    setTapPoint(null);
    setSelectedShop(null);
    setSelected(o);
    setFollow(false);
    setFocus({ lat: o.lat, lng: o.lng, zoom: 16 });
  }, []);

  // ao abrir o mapa, centraliza uma vez na localização do ciclista (se ele ainda não mexeu no mapa nem veio de um link)
  const centeredRef = useRef(false);
  const onUserPan = useCallback(() => {
    centeredRef.current = true;
    setFollow(false);
  }, []);
  useEffect(() => {
    if (centeredRef.current || !ride.pos) return;
    centeredRef.current = true;
    if (searchParams.get("lat") || ride.riding) return; // link "Ver no mapa" ou pedal em andamento já têm câmera própria
    setFocus({ lat: ride.pos.lat, lng: ride.pos.lng, zoom: 16 });
  }, [ride.pos, ride.riding, searchParams]);

  // toque num ponto vazio do mapa = pino com as opções "ir até aqui" / "reportar aqui"
  const { chooseDestination } = nav;
  const onTap = useCallback(
    (lat: number, lng: number) => {
      if (phase === "navigating" || phase === "arrived") return; // guiando: toque solto não deve atrapalhar
      if (editorMode !== "off") return; // desenhando/apagando traçados: o toque não abre o cartão do ponto
      setSelected(null);
      setSelectedShop(null);
      setFollow(false);
      setTapPoint({ lat, lng });
    },
    [phase, editorMode],
  );

  const goToTapPoint = () => {
    if (!tapPoint) return;
    chooseDestination({ ...tapPoint, name: "Ponto escolhido no mapa" });
    setTapPoint(null);
  };

  const suggestAtTapPoint = () => {
    if (!tapPoint) return;
    setSuggestCoords(tapPoint);
    setSuggestOpen(true);
    setTapPoint(null);
  };

  const routeToShop = (shop: Shop) => {
    chooseDestination({ lat: shop.lat, lng: shop.lng, name: shop.name });
    setSelectedShop(null);
  };

  const reportAtTapPoint = () => {
    if (!tapPoint) return;
    setReportCoords(tapPoint);
    setModalOpen(true);
    setTapPoint(null);
  };

  // ao entrar na navegação, o pino some
  useEffect(() => {
    if (phase !== "idle") setTapPoint(null);
  }, [phase]);

  const toggleType = (t: ObstacleType) =>
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  // deslizar o cartão do alerta para baixo fecha (gesto)
  const onCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cardDragRef.current = e.clientY;
  };
  const onCardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (cardDragRef.current === null) return;
    setCardDy(Math.max(0, e.clientY - cardDragRef.current));
  };
  const onCardPointerUp = () => {
    if (cardDragRef.current === null) return;
    cardDragRef.current = null;
    if (cardDy > SWIPE_DISMISS_PX) setSelected(null);
    setCardDy(0);
  };

  const confirmMutation = useMutation({
    mutationFn: (id: string) => apiPost<ReportResult>(`/obstacles/${id}/confirm`),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setSelected((s) => (s ? { ...s, confirms: res.obstacle.confirms } : s));
      toast.success("Alerta confirmado! +25 XP");
      for (const b of res.new_badges) {
        toast.success(`Novo selo desbloqueado: ${b.name}`, { description: b.desc });
        confetti({ particleCount: 130, spread: 75, origin: { y: 0.7 }, colors: ["#10B981", "#F97316", "#FBBF24"] });
      }
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível confirmar agora")),
  });

  // só a conta dev: tira do mapa um alerta que não existe mais (pede confirmação)
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setConfirmRemove(false), [selected?.id]);
  const removeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/obstacles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["moderation"] });
      setSelected(null);
      toast.success("Alerta removido do mapa");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível remover o alerta")),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiPost<Obstacle>(`/obstacles/${id}/resolve`),
    onSuccess: (o) => {
      void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      setSelected((s) => (s ? { ...s, status: o.status } : s));
      toast.success("Alerta marcado como resolvido. Obrigado!");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível resolver o alerta")),
  });

  return (
    <div
      className="relative h-[calc(100svh-3.5rem)] w-full overflow-hidden"
      style={{ "--inset": `${inset}px` } as CSSProperties}
      data-testid="map-page"
    >
      <FortalezaMap
        bikeLanes={lanes}
        obstacles={filtered}
        userPos={ride.pos}
        heading={ride.heading}
        navigating={phase === "navigating"}
        follow={follow}
        onUserPan={onUserPan}
        route={nav.remainingCoords}
        routeObstacleIds={nav.routeObstacleIds}
        hazardLevels={watch.levels}
        guideTo={primary ? { lat: primary.obstacle.lat, lng: primary.obstacle.lng } : null}
        fitRoute={phase === "preview"}
        destination={nav.destination}
        bottomInset={inset}
        pickMode={pickMode || editorMode === "draw"}
        onPick={onPick}
        onTap={onTap}
        tapPoint={tapPoint}
        onSelectObstacle={onSelectObstacle}
        drawPoints={editorMode === "draw" ? drawPoints : undefined}
        onSelectLane={editorMode === "erase" ? setEraseTarget : undefined}
        shops={visibleShops}
        onSelectShop={onSelectShop}
        focus={focus}
        className="absolute inset-0 h-full w-full"
      />

      {/* Topo: próxima manobra (navegando) ou radar de perigos, e logo abaixo o cartão de alerta */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[1180] flex flex-col gap-2 md:left-[404px] md:right-3 md:max-w-[460px] [&>*]:pointer-events-auto">
        {phase === "navigating" ? (
          <ManeuverBanner nav={nav} ride={ride} />
        ) : (
          !pickMode && editorMode === "off" && (
            <MapHud
              ride={ride}
              hazards={watch.hazards}
              totalAlerts={filtered.length}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn((v) => !v)}
              onStartDemo={handleStartDemo}
            />
          )
        )}
        {primary && (
          <HazardAlertCard
            key={primary.obstacle.id}
            hazard={primary}
            othersAhead={watch.othersAhead}
            onDismiss={() => dismiss(primary.obstacle.id)}
            onFocus={focusPrimary}
          />
        )}
      </div>

      <LaneEditor
        mode={editorMode}
        points={drawPoints}
        onModeChange={setEditorMode}
        onPointsChange={setDrawPoints}
        eraseTarget={eraseTarget}
        onEraseTargetChange={setEraseTarget}
      />

      {/* Dica do modo "reportar" */}
      {pickMode && (
        <div className="absolute left-1/2 top-3 z-[1180] -translate-x-1/2 rounded-full border border-orange-500/50 bg-slate-900/90 px-4 py-2 text-xs font-medium text-orange-200 shadow-xl backdrop-blur-md">
          Toque no mapa para marcar o obstáculo
          <button type="button" className="ml-3 underline" onClick={() => setPickMode(false)}>
            cancelar
          </button>
        </div>
      )}

      {/* Botões flutuantes (acompanham a altura do painel inferior) */}
      <div className="absolute right-3 z-[1160] flex flex-col items-end gap-3 bottom-[calc(var(--inset)+16px)] md:bottom-6">
        {!follow && ride.pos && (
          <Button
            size="icon-lg"
            variant="secondary"
            className="h-11 w-11 rounded-full border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-md"
            onClick={() => setFollow(true)}
            aria-label="Recentralizar no meu local"
            data-testid="map-recenter"
          >
            <LocateFixed className="h-5 w-5 text-emerald-400" />
          </Button>
        )}
        {phase === "navigating" && (
          <Button
            size="icon-lg"
            variant="secondary"
            className="h-11 w-11 rounded-full border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-md"
            onClick={() => setSoundOn((v) => !v)}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Silenciar avisos" : "Ativar avisos sonoros"}
            data-testid="hazard-sound-toggle"
          >
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-slate-500" />}
          </Button>
        )}
        <Button
          size="icon-lg"
          variant="secondary"
          className="h-11 w-11 rounded-full border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur-md"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-label="Camadas de alerta"
          aria-expanded={filtersOpen}
          data-testid="map-filters-toggle"
        >
          <Layers className="h-5 w-5" />
        </Button>
        <Button
          size="lg"
          className="h-12 rounded-full bg-orange-500 px-4 text-[#431407] shadow-[0_8px_30px_rgba(249,115,22,0.35)] hover:bg-orange-400"
          onClick={() => setPickMode((p) => !p)}
          aria-label="Reportar obstáculo"
          data-testid="map-report-button"
        >
          <FlagTriangleRight className="h-5 w-5" />
          <span className="hidden md:inline">{pickMode ? "Cancelar" : "Reportar obstáculo"}</span>
        </Button>
      </div>

      {/* Filtros de camada */}
      {filtersOpen && (
        <div
          className="absolute right-16 z-[1160] w-[230px] max-w-[calc(100vw-5rem)] rounded-xl border border-slate-700/60 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-md bottom-[calc(var(--inset)+16px)] md:bottom-6"
          data-testid="map-filters"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Camadas de alerta</p>
          <div className="mt-2 space-y-1">
            {ALL_TYPES.map((t) => {
              const on = typeFilter.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`filter-${t}`}
                  onClick={() => toggleType(t)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                    on ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-800/50",
                  )}
                >
                  <HazardIcon type={t} size={16} className={on ? "" : "opacity-40 grayscale"} />
                  {OBSTACLE_TYPES[t].label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-testid="filter-shops"
            onClick={() => {
              setShowShops((v) => !v);
              setSelectedShop(null);
            }}
            className={cn(
              "mt-1 flex w-full items-center gap-2 rounded-md border-t border-slate-800 px-2 py-2 text-left text-xs font-medium transition-colors",
              showShops ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-800/50",
            )}
          >
            <Wrench className={cn("h-4 w-4 text-sky-400", !showShops && "opacity-40")} />
            Borracharias e oficinas
          </button>
          <button
            type="button"
            data-testid="filter-bicicletar"
            onClick={() => {
              setShowBikeShare((v) => !v);
              setSelectedShop(null);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium transition-colors",
              showBikeShare ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-800/50",
            )}
          >
            <Bike className={cn("h-4 w-4 text-amber-400", !showBikeShare && "opacity-40")} />
            Bicicletar e aluguel de bike
          </button>
          {user?.is_moderator && (
            <button
              type="button"
              data-testid="lane-editor-open"
              onClick={() => {
                setEditorMode("draw");
                setFiltersOpen(false);
                setPickMode(false);
                setTapPoint(null);
                setSelected(null);
                setSelectedShop(null);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-slate-800 px-2 py-2 text-left text-xs font-medium text-yellow-300 hover:bg-slate-800/50"
            >
              <Pencil className="h-4 w-4" /> Desenhar / apagar ciclovias
            </button>
          )}
          <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
            <span className="mr-1 inline-block h-0.5 w-5 bg-emerald-500 align-middle" /> ciclovia
            <span className="mx-1 ml-2 inline-block h-0.5 w-5 border-b-2 border-dashed border-sky-400 align-middle" /> ciclofaixa
          </div>
        </div>
      )}

      {/* Painel inferior arrastável: busca → prévia da rota → guiando → chegada */}
      {phase === "navigating" ? (
        <NavBubble nav={nav} onInsetChange={setInset} />
      ) : (
        <BottomSheet
          snaps={SHEET_SNAPS[phase]}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          onInsetChange={setInset}
          testId="nav-sheet"
        >
          <NavigationPanel nav={nav} ride={ride} lanes={lanes} sheetIndex={sheetIndex} />
        </BottomSheet>
      )}

      {/* Viagem interrompida (o celular fechou o app em segundo plano): retomar? */}
      {savedTrip && phase === "idle" && (
        <div
          className="absolute left-3 right-3 top-3 z-[1190] rounded-2xl border border-emerald-400/40 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md md:left-[404px] md:right-auto md:w-[380px]"
          data-testid="resume-trip"
        >
          <p className="text-sm font-semibold text-white">Retomar a viagem?</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">Você estava indo para {savedTrip.destination.name}.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={resumeTrip} data-testid="resume-trip-yes">Retomar</Button>
            <Button size="sm" variant="outline" onClick={dismissSavedTrip}>Descartar</Button>
          </div>
        </div>
      )}

      {/* Cartão do ponto tocado: ir até lá ou reportar um perigo ali */}
      {tapPoint && !selected && !selectedShop && (
        <Card
          className="absolute left-3 right-3 z-[1170] border-slate-700/80 bg-slate-900/95 backdrop-blur-md bottom-[calc(var(--inset)+12px)] md:bottom-6 md:left-[404px] md:right-auto md:w-[340px]"
          data-testid="map-tap-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm">Ponto no mapa</CardTitle>
            <CardDescription className="text-xs">O que você quer fazer aqui?</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-xs" onClick={() => setTapPoint(null)} aria-label="Fechar" data-testid="map-tap-close">
                <X className="h-4 w-4" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="col-span-2 h-8 justify-start text-xs text-sky-300 hover:text-sky-200"
              onClick={suggestAtTapPoint}
              data-testid="map-tap-shop"
            >
              <Wrench className="h-4 w-4" /> Há uma borracharia/oficina aqui? Adicionar
            </Button>
            <Button onClick={goToTapPoint} data-testid="map-tap-go">
              <Navigation className="h-4 w-4" /> Ir até aqui
            </Button>
            <Button variant="outline" onClick={reportAtTapPoint} data-testid="map-tap-report">
              <FlagTriangleRight className="h-4 w-4" /> Reportar aqui
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bolha da borracharia/oficina: telefone, horário, nota e avaliações */}
      {selectedShop && !selected && (
        <ShopCard key={selectedShop.id} shop={selectedShop} onClose={() => setSelectedShop(null)} onRouteTo={routeToShop} />
      )}

      {/* Painel do alerta selecionado (deslize para baixo para fechar) */}
      {selected && (
        <Card
          className="absolute left-3 right-3 z-[1170] border-slate-700/80 bg-slate-900/95 backdrop-blur-md bottom-[calc(var(--inset)+12px)] md:bottom-6 md:left-[404px] md:right-auto md:w-[340px]"
          style={{ transform: cardDy ? `translateY(${cardDy}px)` : undefined, opacity: cardDy ? 1 - cardDy / 220 : 1 }}
          data-testid="obstacle-details"
        >
          <div
            className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerUp={onCardPointerUp}
            onPointerCancel={onCardPointerUp}
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-slate-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-heading text-sm">
              <HazardIcon type={selected.type} size={20} />
              {OBSTACLE_TYPES[selected.type].label}
              {selected.status === "resolvido" && <Badge variant="secondary">resolvido</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">
              Gravidade: {SEVERITY_LABELS[selected.severity]} · reportado por {selected.user_name}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-xs" onClick={() => setSelected(null)} data-testid="obstacle-details-close">
                <X className="h-4 w-4" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-xs text-slate-300">
            <p className="leading-relaxed">{selected.description}</p>
            <PhotoStrip ids={selected.photo_ids} />
            <p className="mt-2 text-slate-500">
              {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true, locale: ptBR })} ·{" "}
              <span data-testid="obstacle-confirms">{selected.confirms} confirmações</span>
            </p>
            {selected.status !== "resolvido" && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate(selected.id)}
                  data-testid="obstacle-confirm-button"
                >
                  Confirmar alerta
                </Button>
                {user?.id === selected.user_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(selected.id)}
                    data-testid="obstacle-resolve-button"
                  >
                    Marcar resolvido
                  </Button>
                )}
              </div>
            )}
            {user?.is_moderator && (
              <div className="mt-3 border-t border-slate-800 pt-3" data-testid="obstacle-remove-box">
                {!confirmRemove ? (
                  <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => setConfirmRemove(true)} data-testid="obstacle-remove">
                    Remover alerta do mapa
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-red-200">Remover de vez? Não dá para desfazer.</span>
                    <Button size="sm" variant="destructive" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(selected.id)} data-testid="obstacle-remove-confirm">
                      {removeMutation.isPending ? "Removendo…" : "Sim, remover"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Cancelar</Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SuggestShopModal open={suggestOpen} onOpenChange={setSuggestOpen} coords={suggestCoords} />
      <ReportObstacleModal open={modalOpen} onOpenChange={setModalOpen} coords={reportCoords} />
    </div>
  );
}
