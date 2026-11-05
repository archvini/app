import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bike, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { apiDetail, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";

const HERO_IMG =
  "https://images.unsplash.com/photo-1560971923-16c232d1ee89?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwxfHxmb3J0YWxlemElMjBicmF6aWwlMjBjb2FzdGxpbmUlMjBvY2VhbnxlbnwwfHx8fDE3OTEyMzcwNDF8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiPost<User>("/auth/login", { email, password }),
    onSuccess: async (u) => {
      await beginSession();
      toast.success(`Boa pedalada, ${u.name}!`);
      navigate("/map");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível entrar. Tente novamente.")),
  });

  return (
    <div className="grid min-h-[calc(100svh-3.5rem)] lg:grid-cols-2" data-testid="login-page">
      {/* Painel de marca */}
      <div className="relative hidden lg:block">
        <img src={HERO_IMG} alt="Orla de Fortaleza" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090D16] via-[#090D16]/70 to-[#090D16]/40" />
        <div className="relative flex h-full flex-col justify-end p-10">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-[#022C22]">
            <Bike className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-heading text-3xl font-black leading-tight tracking-tight text-white">
            Bem-vindo de volta à rede que pedala Fortaleza.
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Alertas de buracos e obras em tempo real</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Missões, selos e XP a cada pedalada</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Mapa das ciclovias e ciclofaixas da cidade</li>
          </ul>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-3xl font-black tracking-tight text-white" data-testid="login-title">Entrar</h1>
          <p className="mt-1 text-sm text-slate-400">Sua conta conecta você à rede de ciclistas da cidade.</p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                E-mail
              </Label>
              <Input
                id="login-email"
                data-testid="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Senha
              </Label>
              <Input
                id="login-password"
                data-testid="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="text-right">
              <Link to="/esqueci-senha" className="text-xs font-semibold text-emerald-400 hover:underline" data-testid="login-forgot">
                Esqueci minha senha
              </Link>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={mutation.isPending}
              data-testid="login-submit"
            >
              {mutation.isPending ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Ainda não tem conta?{" "}
            <Link to="/register" className="font-semibold text-emerald-400 hover:underline" data-testid="login-link-register">
              Cadastre-se grátis
            </Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Precisa de ajuda? <a href={SUPPORT_MAILTO} className="underline hover:text-slate-300">{SUPPORT_EMAIL}</a>
          {" · "}
          <Link to="/termos" className="underline hover:text-slate-300">Termos</Link>
          {" · "}
          <Link to="/privacidade" className="underline hover:text-slate-300">Privacidade</Link>
        </p>
      </div>
    </div>
  );
}