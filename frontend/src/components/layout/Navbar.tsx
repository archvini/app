import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bike, FlagTriangleRight, Inbox, Map as MapIcon, MessagesSquare, Settings, Trophy, Users, User as UserIcon, Zap } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BugReportButton from "@/components/layout/BugReportButton";
import NotificationBell from "@/components/layout/NotificationBell";
import Avatar from "@/components/profile/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { ModerationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/map", label: "Mapa" },
  { to: "/missions", label: "Missões" },
  { to: "/chat", label: "Chat" },
  { to: "/ciclistas", label: "Ciclistas" },
  { to: "/profile", label: "Perfil" },
];

export default function Navbar() {
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  // só a conta dev vê a caixa de alertas e o número de alertas esperando análise
  const isMod = !!user?.is_moderator;
  const { data: modSummary } = useQuery({
    queryKey: ["moderation", "summary"],
    queryFn: () => apiGet<ModerationSummary>("/moderation/summary"),
    enabled: isMod,
    refetchInterval: 30000,
  });
  const pendingCount = modSummary?.pendente ?? 0;

  const handleLogout = async () => {
    setBusy(true);
    try {
      await endSession();
      navigate("/");
      toast.success("Sessão encerrada. Boa pedalada!");
    } finally {
      setBusy(false);
    }
  };

  const showBottomBar = !["/login", "/register"].includes(location.pathname);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[1200] h-14 border-b border-slate-800/70 bg-[#090D16]/85 backdrop-blur-md">
        <div className="flex h-full items-center justify-between px-4">
          <div className="flex items-center gap-5">
            <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-[#022C22]">
                <Bike className="h-5 w-5" />
              </span>
              <span className="font-heading text-lg font-bold tracking-tight text-white">VaiDeBike</span>
              <span className="hidden rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
                Fortaleza
              </span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {[...NAV_LINKS, ...(isMod ? [{ to: "/alertas", label: "Caixa de alertas" }] : [])].map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  data-testid={`nav-link-${l.to.slice(1)}`}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white",
                      isActive && "bg-slate-800/80 text-emerald-400",
                    )
                  }
                >
                  {l.label}
                  {l.to === "/alertas" && pendingCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-[#431407]" data-testid="inbox-count">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="hidden bg-orange-500 text-[#431407] hover:bg-orange-400 sm:inline-flex"
              onClick={() => navigate("/map?report=1")}
              data-testid="nav-report-button"
            >
              <FlagTriangleRight className="h-4 w-4" /> Reportar
            </Button>
            <BugReportButton />
            {user && <NotificationBell />}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/70 py-1 pl-1 pr-3 transition-colors hover:border-emerald-500/50"
                  data-testid="nav-user-menu"
                >
                  <Avatar name={user.name} src={user.avatar} className="h-7 w-7" textClassName="text-xs" />
                  <span className="hidden text-xs font-semibold text-slate-200 sm:inline">Nv. {user.level}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="nav-menu-profile">
                    <UserIcon className="h-4 w-4" /> Meu perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/ciclistas")} data-testid="nav-menu-people">
                    <Users className="h-4 w-4" /> Ciclistas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/configuracoes")} data-testid="nav-menu-settings">
                    <Settings className="h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                  {isMod && (
                    <DropdownMenuItem onClick={() => navigate("/alertas")} data-testid="nav-menu-inbox">
                      <Inbox className="h-4 w-4" /> Caixa de alertas
                      {pendingCount > 0 && (
                        <span className="ml-auto rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-[#431407]">
                          {pendingCount}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleLogout}
                    disabled={busy}
                    data-testid="nav-logout"
                  >
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="nav-login">
                  Entrar
                </Link>
                <Link
                  to="/register"
                  className={buttonVariants({ variant: "default", size: "sm" })}
                  data-testid="nav-register"
                >
                  Criar conta
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {showBottomBar && (
        <nav
          className="fixed inset-x-0 bottom-0 z-[1200] grid h-[calc(3.5rem+env(safe-area-inset-bottom))] grid-cols-5 pb-[env(safe-area-inset-bottom)] items-stretch border-t border-slate-800 bg-[#090D16]/95 backdrop-blur md:hidden"
          data-testid="mobile-bottom-nav"
        >
          <Link
            to="/map"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-400"
            data-testid="bottom-nav-map"
          >
            <MapIcon className="h-5 w-5" /> Mapa
          </Link>
          <Link
            to="/missions"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-400"
            data-testid="bottom-nav-missions"
          >
            <Trophy className="h-5 w-5" /> Missões
          </Link>
          <Link
            to="/chat"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-400"
            data-testid="bottom-nav-chat"
          >
            <MessagesSquare className="h-5 w-5" /> Chat
          </Link>
          <Link
            to="/map?report=1"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-orange-400"
            data-testid="bottom-nav-report"
          >
            <FlagTriangleRight className="h-5 w-5" /> Reportar
          </Link>
          <Link
            to="/profile"
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-400"
            data-testid="bottom-nav-profile"
          >
            <Zap className="h-5 w-5" /> Perfil
          </Link>
        </nav>
      )}
    </>
  );
}
