import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Bike, Medal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDetail, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { BIKE_LABELS } from "@/lib/types";
import type { User } from "@/lib/types";

const HERO_IMG =
  "https://images.unsplash.com/photo-1601971360277-7b4c8aa60894?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwzfHxjeWNsaXN0JTIwaGVsbWV0JTIwc2FmZXR5JTIwdXJiYW58ZW58MHx8fHwxNzkxMjM3MDQxfDA&ixlib=rb-4.1.0&q=85";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bikeType, setBikeType] = useState("urbana");

  const mutation = useMutation({
    mutationFn: () => apiPost<User>("/auth/register", { name, email, password, bike_type: bikeType }),
    onSuccess: async (u) => {
      await beginSession();
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.7 }, colors: ["#10B981", "#F97316", "#FBBF24"] });
      toast.success(`Bem-vindo(a) ao VaiDeBike, ${u.name.split(" ")[0]}!`, {
        description: "Emblema “Calouro do Pedal” desbloqueado no seu perfil.",
      });
      navigate("/map");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível criar a conta. Tente novamente.")),
  });

  return (
    <div className="grid min-h-[calc(100svh-3.5rem)] lg:grid-cols-2" data-testid="register-page">
      {/* Painel de marca */}
      <div className="relative hidden lg:block">
        <img src={HERO_IMG} alt="Ciclista urbano com capacete" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090D16] via-[#090D16]/70 to-[#090D16]/40" />
        <div className="relative flex h-full flex-col justify-end p-10">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-[#431407]">
            <Bike className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-heading text-3xl font-black leading-tight tracking-tight text-white">
            Comece no nível 1 com o emblema Calouro do Pedal.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            Reporte buracos, confirme obras, pedale pelas ciclovias da Beira-Mar e suba de nível — a cidade
            fica mais segura a cada alerta.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Medal className="h-4 w-4" /> Primeiro emblema desbloqueado no cadastro
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-3xl font-black tracking-tight text-white" data-testid="register-title">
            Criar conta
          </h1>
          <p className="mt-1 text-sm text-slate-400">Grátis, rápido e feito para quem pedala em Fortaleza.</p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="register-name" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Nome
              </Label>
              <Input
                id="register-name"
                data-testid="register-name"
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como você se chama?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                E-mail
              </Label>
              <Input
                id="register-email"
                data-testid="register-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Senha
              </Label>
              <Input
                id="register-password"
                data-testid="register-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo de 8 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipo de bike</Label>
              <Select value={bikeType} onValueChange={(v: string) => setBikeType(v)}>
                <SelectTrigger data-testid="register-bike-type">
                  <SelectValue>{(v: string) => BIKE_LABELS[v] ?? "Urbana"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BIKE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={mutation.isPending} data-testid="register-submit">
              {mutation.isPending ? "Criando conta…" : "Criar conta e pedalar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Já pedala com a gente?{" "}
            <Link to="/login" className="font-semibold text-emerald-400 hover:underline" data-testid="register-link-login">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}