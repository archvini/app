import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CircleHelp, KeyRound, Mail, PauseCircle, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { apiDetail, apiPut, apiPost } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { User } from "@/lib/types";

const LABEL = "text-xs font-semibold uppercase tracking-wider text-slate-400";

function Card({ title, hint, children, tone }: { title: string; hint?: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section
      className={
        tone === "danger"
          ? "rounded-xl border border-red-500/30 bg-red-500/5 p-5"
          : "rounded-xl border border-slate-800 bg-slate-900/50 p-5"
      }
    >
      <h2 className="font-heading text-lg font-bold text-white">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={LABEL}>
        {label}
      </Label>
      <Input id={id} {...props} />
    </div>
  );
}

/** Nome de usuário (como aparece para os outros) e e-mail de login. */
export function AccountSection({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  useEffect(() => setName(user.name), [user.name]);

  const nameMutation = useMutation({
    mutationFn: () => apiPut<User>("/auth/me", { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Nome atualizado!");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível salvar o nome")),
  });

  const emailMutation = useMutation({
    mutationFn: () => apiPost<User>("/auth/email", { new_email: email, password: emailPassword }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setEmail("");
      setEmailPassword("");
      toast.success("E-mail alterado! Use o novo endereço para entrar.");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível trocar o e-mail")),
  });

  return (
    <div className="space-y-6">
      <Card title="Nome de usuário" hint="É o nome que os outros ciclistas veem no mapa, no chat e nos alertas que você reporta.">
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim().length < 2) return toast.error("O nome precisa ter pelo menos 2 letras");
            nameMutation.mutate();
          }}
        >
          <Field id="set-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} data-testid="set-name" />
          <Button type="submit" disabled={nameMutation.isPending || name.trim() === user.name} data-testid="set-name-save">
            <Save className="h-4 w-4" /> {nameMutation.isPending ? "Salvando…" : "Salvar nome"}
          </Button>
        </form>
      </Card>

      <Card title="E-mail de login" hint={`Hoje: ${user.email}. Por segurança, confirme sua senha para trocar.`}>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            emailMutation.mutate();
          }}
        >
          <Field id="set-email" label="Novo e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="set-email" />
          <Field id="set-email-pw" label="Sua senha" type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} data-testid="set-email-password" />
          <Button type="submit" disabled={emailMutation.isPending || !email || !emailPassword} data-testid="set-email-save">
            <Mail className="h-4 w-4" /> {emailMutation.isPending ? "Trocando…" : "Trocar e-mail"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && next !== confirm;

  const mutation = useMutation({
    mutationFn: () => apiPost("/auth/password", { current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Senha alterada. Os outros aparelhos foram desconectados.");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível alterar a senha")),
  });

  return (
    <Card title="Alterar senha" hint="Ao trocar, os outros aparelhos saem da sua conta. Esqueceu a atual? Saia e use “Esqueci minha senha” no login.">
      <form
        className="space-y-3"
        data-testid="profile-security"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (next.length < 8) return toast.error("A nova senha precisa ter pelo menos 8 caracteres");
          if (mismatch) return;
          mutation.mutate();
        }}
      >
        <Field id="pw-current" label="Senha atual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="pw-current" />
        <Field id="pw-new" label="Nova senha" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} maxLength={100} data-testid="pw-new" />
        <Field id="pw-confirm" label="Repita a nova senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch && <p className="text-xs text-red-400">As senhas não são iguais.</p>}
        <Button type="submit" disabled={mutation.isPending || !current || !next || mismatch} data-testid="pw-submit">
          <KeyRound className="h-4 w-4" /> {mutation.isPending ? "Salvando…" : "Alterar senha"}
        </Button>
      </form>
    </Card>
  );
}

export function HelpSection() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tutorial = useMutation({
    mutationFn: () => apiPost<User>("/auth/onboarding", { done: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] }); // o gate do App reabre o tutorial
      navigate("/map");
    },
  });
  return (
    <Card title="Ajuda" hint="Veja de novo a tela de boas-vindas e o guia de como usar o mapa, o GPS e os alertas.">
      <Button variant="outline" onClick={() => tutorial.mutate()} disabled={tutorial.isPending} data-testid="profile-tutorial">
        <CircleHelp className="h-4 w-4" /> Ver tutorial
      </Button>
    </Card>
  );
}

/** Desativar (temporário, reversível) ou excluir (definitivo). Ambos pedem a senha. */
export function DangerSection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"none" | "deactivate" | "delete">("none");
  const [password, setPassword] = useState("");

  const leave = async (msg: string) => {
    await endSession();
    navigate("/");
    toast.success(msg);
  };

  const deactivate = useMutation({
    mutationFn: () => apiPost("/auth/deactivate", { password }),
    onSuccess: () => leave("Conta desativada. Entre de novo quando quiser voltar a pedalar."),
    onError: (err) => toast.error(apiDetail(err, "Não foi possível desativar a conta")),
  });
  const remove = useMutation({
    mutationFn: () => apiPost("/auth/delete-account", { password }),
    onSuccess: () => leave("Conta excluída. Obrigado por pedalar com a gente."),
    onError: (err) => toast.error(apiDetail(err, "Não foi possível excluir a conta")),
  });

  const reset = () => {
    setMode("none");
    setPassword("");
  };

  const confirmBox = (kind: "deactivate" | "delete") => {
    const m = kind === "deactivate" ? deactivate : remove;
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
        <Label htmlFor="danger-pw" className="text-xs text-red-200">
          Digite sua senha para confirmar
        </Label>
        <Input id="danger-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid={kind === "delete" ? "delete-password" : "deactivate-password"} />
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" disabled={m.isPending || !password} onClick={() => m.mutate()} data-testid={kind === "delete" ? "delete-confirm" : "deactivate-confirm"}>
            {kind === "delete" ? (m.isPending ? "Excluindo…" : "Excluir definitivamente") : m.isPending ? "Desativando…" : "Desativar conta"}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card title="Desativar temporariamente" hint="Seu perfil some das buscas e do placar, mas XP, selos e histórico ficam guardados. Para reativar, é só entrar de novo.">
        {mode !== "deactivate" ? (
          <Button variant="outline" size="sm" onClick={() => { setMode("deactivate"); setPassword(""); }} data-testid="deactivate-start">
            <PauseCircle className="h-4 w-4" /> Desativar conta
          </Button>
        ) : (
          confirmBox("deactivate")
        )}
      </Card>
      <Card
        tone="danger"
        title="Excluir minha conta"
        hint="Apaga seu perfil, selos, XP, seguidores e histórico de pedais para sempre. Os alertas já publicados continuam no mapa para proteger outros ciclistas."
      >
        {mode !== "delete" ? (
          <Button variant="outline" size="sm" onClick={() => { setMode("delete"); setPassword(""); }} data-testid="delete-start">
            <Trash2 className="h-4 w-4" /> Excluir conta
          </Button>
        ) : (
          confirmBox("delete")
        )}
      </Card>
    </div>
  );
}
