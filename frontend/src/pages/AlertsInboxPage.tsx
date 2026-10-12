import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bug, Check, Inbox, MapPin, Pencil, Phone, ShieldAlert, Wrench, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import AnnouncementForm from "@/components/layout/AnnouncementForm";
import HazardIcon from "@/components/map/HazardIcon";
import MiniMap from "@/components/map/MiniMap";
import PhotoStrip from "@/components/map/PhotoStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiDetail, apiGet, apiPatch, apiPost } from "@/lib/api";
import { SEVERITY_COLORS } from "@/lib/hazards";
import { BUG_CATEGORIES, OBSTACLE_TYPES, SEVERITY_LABELS } from "@/lib/types";
import { SHOP_META } from "@/lib/shops";
import type { BugItem, BugStatus, ModerationItem, ModerationSummary, Obstacle, ObstacleType, Severity, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(OBSTACLE_TYPES) as ObstacleType[];
const SEVERITIES: Severity[] = ["baixa", "media", "alta"];
const QUICK_REASONS = ["Alerta duplicado", "Local incorreto", "Não é um perigo para ciclistas", "Informação insuficiente"];

type Tab = "pendente" | "recusado" | "locais" | "bugs";

/** Relatos de problemas do app enviados pelos usuários (botão do inseto no topo). */
function BugQueue({ bugs }: { bugs: BugItem[] }) {
  const queryClient = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: BugStatus }) => apiPatch(`/bugs/${v.id}`, { status: v.status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bugs"] }),
    onError: (err) => toast.error(apiDetail(err, "Não foi possível atualizar")),
  });
  if (bugs.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-10 text-center" data-testid="bugs-empty">
        <Bug className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-3 text-sm text-slate-400">Nenhum problema do app em aberto.</p>
      </div>
    );
  }
  return (
    <ul className="mt-5 space-y-3" data-testid="bug-list">
      {bugs.map((b) => (
        <li key={b.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-300">{BUG_CATEGORIES[b.category]}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", b.status === "novo" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300")}>
              {b.status === "novo" ? "Novo" : "Analisando"}
            </span>
            <span className="text-slate-500">
              {b.user_name ?? "Sem login"} · {formatDistanceToNow(new Date(b.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{b.message}</p>
          <p className="mt-2 break-all text-[11px] text-slate-500">
            {b.page} · tela {b.viewport} · {b.user_agent}
          </p>
          <div className="mt-3 flex gap-2">
            {b.status === "novo" && (
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: b.id, status: "analisando" })}>
                Analisando
              </Button>
            )}
            <Button size="sm" onClick={() => setStatus.mutate({ id: b.id, status: "resolvido" })} data-testid="bug-resolve">
              <Check className="h-4 w-4" /> Resolvido
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Locais (borracharias/oficinas) sugeridos por ciclistas, esperando a decisão da equipe. */
function ShopQueue({ shops }: { shops: Shop[] }) {
  const queryClient = useQueryClient();
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["shops"] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => apiPost<Shop>(`/shops/${id}/approve`),
    onSuccess: (s) => {
      toast.success(`${s.name} publicado no mapa`);
      done();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível aprovar")),
  });
  const reject = useMutation({
    mutationFn: (id: string) => apiPost(`/shops/${id}/reject`, { reason: "" }),
    onSuccess: () => {
      toast.success("Sugestão descartada");
      done();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível descartar")),
  });
  if (shops.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-10 text-center" data-testid="inbox-empty">
        <Wrench className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-3 text-sm text-slate-400">Nenhum local esperando análise.</p>
      </div>
    );
  }
  return (
    <ul className="mt-5 space-y-3" data-testid="shop-queue">
      {shops.map((s) => (
        <li key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SHOP_META[s.kind].color }}>{SHOP_META[s.kind].label}</p>
          <p className="font-heading text-base font-bold text-white">{s.name}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
            {s.address && <li>{s.address}</li>}
            {s.hours && <li>{s.hours}</li>}
            {s.phone && <li className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.phone}</li>}
            {s.description && <li>{s.description}</li>}
            <li>Sugerido por <b className="text-slate-200">{s.added_by_name || "ciclista"}</b></li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => approve.mutate(s.id)} disabled={approve.isPending} data-testid={`shop-approve-${s.id}`}>
              <Check className="h-4 w-4" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => reject.mutate(s.id)} disabled={reject.isPending}>
              <X className="h-4 w-4" /> Descartar
            </Button>
            <Link to={`/map?lat=${s.lat}&lng=${s.lng}`} className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-emerald-400 hover:underline">
              <MapPin className="h-3.5 w-3.5" /> Ver no mapa
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AlertCard({ item, active }: { item: ModerationItem; active: Obstacle[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [type, setType] = useState<ObstacleType>(item.type);
  const [severity, setSeverity] = useState<Severity>(item.severity);
  const [description, setDescription] = useState(item.description);
  const [reason, setReason] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["moderation"] });
    void queryClient.invalidateQueries({ queryKey: ["obstacles"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => {
      // só manda o que o gestor mudou
      const edit: Record<string, string> = {};
      if (type !== item.type) edit.type = type;
      if (severity !== item.severity) edit.severity = severity;
      if (description.trim() !== item.description) edit.description = description.trim();
      return apiPost<Obstacle>(`/moderation/${item.id}/approve`, Object.keys(edit).length ? edit : undefined);
    },
    onSuccess: () => {
      toast.success(`Alerta publicado no mapa · +50 XP para ${item.user_name}`);
      refresh();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível aprovar")),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiPost<Obstacle>(`/moderation/${item.id}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success("Alerta recusado. O autor verá o motivo no perfil.");
      refresh();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível recusar")),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const isRejected = item.status === "recusado";
  const meta = OBSTACLE_TYPES[item.type];

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60" data-testid="inbox-item">
      <MiniMap lat={item.lat} lng={item.lng} type={item.type} others={active} className="h-36 w-full" />
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <HazardIcon type={item.type} size={30} />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-bold text-white">{meta.label}</p>
            <p className="text-xs text-slate-400">
              <span style={{ color: SEVERITY_COLORS[item.severity] }} className="font-semibold">
                gravidade {SEVERITY_LABELS[item.severity].toLowerCase()}
              </span>
              {" · "}
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>

        <p className="text-sm leading-snug text-slate-200">{item.description}</p>
        <PhotoStrip ids={item.photo_ids} />

        <p className="text-xs text-slate-400">
          Reportado por <strong className="text-emerald-300" data-testid="inbox-reporter">{item.user_name}</strong>
        </p>

        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            item.nearby_same_type > 0
              ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
              : "border-slate-700 bg-slate-800/40 text-slate-400",
          )}
          data-testid="inbox-nearby"
        >
          {item.nearby_same_type > 0
            ? `Possível duplicado: já há ${item.nearby_same_type} alerta(s) do mesmo tipo a até 60 m.`
            : item.nearest_same_type_m !== null
              ? `O alerta do mesmo tipo mais próximo está a ${Math.round(item.nearest_same_type_m)} m.`
              : "Nenhum alerta do mesmo tipo no mapa."}
        </p>

        {isRejected && (
          <p className="text-xs text-red-300/90">Recusado{item.reject_reason ? `: ${item.reject_reason}` : ""}</p>
        )}

        {editing && (
          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3" data-testid="inbox-edit">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  aria-label={OBSTACLE_TYPES[t].label}
                  className={cn(
                    "rounded-lg border p-1 transition-colors",
                    type === t ? "border-emerald-500 bg-emerald-500/10" : "border-slate-700 opacity-60 hover:opacity-100",
                  )}
                >
                  <HazardIcon type={t} size={22} />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    severity === s ? "border-orange-500 bg-orange-500/10 text-white" : "border-slate-700 text-slate-300",
                  )}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} aria-label="Descrição" />
          </div>
        )}

        {rejecting && (
          <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3" data-testid="inbox-reject">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    reason === r ? "border-red-400 bg-red-500/15 text-white" : "border-slate-700 text-slate-300",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Motivo (o autor vai ler)" aria-label="Motivo da recusa" />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => rejectMutation.mutate()} data-testid="inbox-reject-confirm">
                {rejectMutation.isPending ? "Recusando…" : "Confirmar recusa"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                Voltar
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" disabled={busy || description.trim().length < 3} onClick={() => approveMutation.mutate()} data-testid="inbox-approve">
            <Check className="h-4 w-4" /> {approveMutation.isPending ? "Publicando…" : isRejected ? "Aprovar mesmo assim" : "Aprovar"}
          </Button>
          {!isRejected && !rejecting && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)} data-testid="inbox-reject-start">
              <X className="h-4 w-4" /> Recusar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} data-testid="inbox-edit-toggle">
            <Pencil className="h-4 w-4" /> {editing ? "Fechar ajustes" : "Ajustar"}
          </Button>
          <Link
            to={`/map?lat=${item.lat}&lng=${item.lng}`}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" /> Ver no mapa
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Caixa de alertas: a conta dev analisa o que os ciclistas enviam e decide o que vai para o mapa/radar. */
export default function AlertsInboxPage() {
  const { data: user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("pendente");
  const isMod = !!user?.is_moderator;
  const { data: bugs = [] } = useQuery({
    queryKey: ["bugs"],
    queryFn: () => apiGet<BugItem[]>("/bugs"),
    enabled: isMod,
    refetchInterval: 30000,
  });

  const { data: summary } = useQuery({
    queryKey: ["moderation", "summary"],
    queryFn: () => apiGet<ModerationSummary>("/moderation/summary"),
    enabled: isMod,
    refetchInterval: 20000,
  });
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["moderation", "queue", tab],
    queryFn: () => apiGet<ModerationItem[]>(`/moderation/queue?status=${tab === "locais" ? "pendente" : tab}`),
    enabled: isMod && tab !== "locais" && tab !== "bugs",
    refetchInterval: 20000,
  });
  const { data: shopQueue = [] } = useQuery({
    queryKey: ["shops", "queue"],
    queryFn: () => apiGet<Shop[]>("/shops/moderation/queue"),
    enabled: isMod,
    refetchInterval: 30000,
  });
  const { data: active = [] } = useQuery({
    queryKey: ["obstacles"],
    queryFn: () => apiGet<Obstacle[]>("/obstacles"),
    enabled: isMod,
  });
  const activeStable = useMemo(() => active, [active]);

  if (isLoading) return <div className="mx-auto mt-10 h-40 max-w-3xl animate-pulse rounded-xl bg-slate-800/60" />;

  if (!user || !isMod) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="inbox-restricted">
        <ShieldAlert className="mx-auto h-10 w-10 text-orange-400" />
        <h1 className="mt-4 font-heading text-2xl font-black text-white">Área da equipe</h1>
        <p className="mt-2 text-sm text-slate-400">
          {user
            ? "A caixa de alertas é exclusiva da conta de gestão. Se é a sua conta e ela ainda usa a senha padrão, troque a senha em Perfil → Conta e segurança."
            : "Entre com a conta de gestão para analisar os alertas enviados pelos ciclistas."}
        </p>
        {!user && (
          <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-emerald-400 hover:underline">
            Entrar
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-10" data-testid="inbox-page">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-black tracking-tight text-white">Caixa de alertas</h1>
          <p className="mt-1 text-sm text-slate-400">
            Analise o que os ciclistas enviaram. O que você aprova vai para o mapa e para o radar, com o nome de quem reportou.
          </p>
        </div>
        {summary && (
          <p className="hidden shrink-0 text-right text-xs text-slate-500 sm:block">
            <span className="block font-mono text-lg font-bold text-emerald-400">{summary.ativo}</span>
            no mapa
          </p>
        )}
      </div>

      <AnnouncementForm />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-5">
        <TabsList className="w-full">
          <TabsTrigger value="pendente" data-testid="inbox-tab-pendente">
            Em análise{summary ? ` (${summary.pendente})` : ""}
          </TabsTrigger>
          <TabsTrigger value="recusado" data-testid="inbox-tab-recusado">
            Recusados{summary ? ` (${summary.recusado})` : ""}
          </TabsTrigger>
          <TabsTrigger value="locais" data-testid="inbox-tab-locais">
            Locais ({shopQueue.length})
          </TabsTrigger>
          <TabsTrigger value="bugs" data-testid="inbox-tab-bugs">
            Bugs ({bugs.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "bugs" ? (
        <BugQueue bugs={bugs} />
      ) : tab === "locais" ? (
        <ShopQueue shops={shopQueue} />
      ) : loadingItems ? (
        <div className="mt-5 h-56 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-10 text-center" data-testid="inbox-empty">
          <Inbox className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">
            {tab === "pendente" ? "Nenhum alerta esperando análise. Tudo em dia!" : "Nenhum alerta recusado."}
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {items.map((it) => (
            <AlertCard key={it.id} item={it} active={activeStable} />
          ))}
        </ul>
      )}
    </div>
  );
}
