import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, CheckCheck, CircleCheck, CircleX, Bug, Megaphone, Store, Trash2, UserPlus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { NotificationFeed, NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NotificationItem["kind"], { Icon: typeof Bell; cls: string }> = {
  follow: { Icon: UserPlus, cls: "bg-sky-500/15 text-sky-400" },
  alert_ok: { Icon: CircleCheck, cls: "bg-emerald-500/15 text-emerald-400" },
  alert_no: { Icon: CircleX, cls: "bg-rose-500/15 text-rose-400" },
  shop_ok: { Icon: Store, cls: "bg-emerald-500/15 text-emerald-400" },
  shop_no: { Icon: Store, cls: "bg-rose-500/15 text-rose-400" },
  announcement: { Icon: Megaphone, cls: "bg-orange-500/15 text-orange-400" },
  bug_fixed: { Icon: Bug, cls: "bg-emerald-500/15 text-emerald-400" },
};

/** Sino do topo: contador de não lidas (atualiza a cada 30 s) e lista das notificações recentes. */
export default function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: count } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => apiGet<{ unread: number }>("/notifications/unread-count"),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const { data: feed, isLoading } = useQuery({
    queryKey: ["notifications", "feed"],
    queryFn: () => apiGet<NotificationFeed>("/notifications"),
    enabled: open,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => apiPost("/notifications/read-all"), onSuccess: refresh });
  const clearAll = useMutation({ mutationFn: () => apiDelete("/notifications"), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => apiPost(`/notifications/${id}/read`), onSuccess: refresh });

  const unread = count?.unread ?? 0;
  const items = feed?.items ?? [];

  const openItem = (n: NotificationItem) => {
    if (!n.read && n.kind !== "announcement") readOne.mutate(n.id);
    setOpen(false);
    if (n.link.startsWith("/")) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:border-emerald-500/50"
        aria-label={unread > 0 ? `Notificações (${unread} novas)` : "Notificações"}
        data-testid="nav-notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-[#431407]"
            data-testid="notifications-count"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-1.5rem))] p-0" data-testid="notifications-panel">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
          <h2 className="font-heading text-sm font-bold text-white">Notificações</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => readAll.mutate()}
              disabled={unread === 0 || readAll.isPending}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-slate-800 disabled:opacity-40"
              data-testid="notifications-read-all"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar como lidas
            </button>
            <button
              type="button"
              onClick={() => clearAll.mutate()}
              disabled={items.length === 0 || clearAll.isPending}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-40"
              aria-label="Limpar notificações"
              data-testid="notifications-clear"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-[min(26rem,70dvh)] overflow-y-auto overscroll-contain">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center" data-testid="notifications-empty">
              <Bell className="mx-auto mb-2 h-6 w-6 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Tudo em dia por aqui</p>
              <p className="mt-1 text-xs text-slate-500">Novos seguidores e o resultado dos seus alertas aparecem aqui.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const { Icon, cls } = KIND_ICON[n.kind] ?? KIND_ICON.announcement;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-slate-800/60 px-3 py-3 text-left transition-colors hover:bg-slate-800/60",
                        !n.read && "bg-emerald-500/5",
                      )}
                      data-testid={`notification-${n.id}`}
                    >
                      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cls)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[13px] leading-snug", n.read ? "text-slate-300" : "font-semibold text-white")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-xs leading-snug text-slate-400">{n.body}</span>}
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-500">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </span>
                      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="não lida" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
