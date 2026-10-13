import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDetail, apiPost } from "@/lib/api";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;

  const mutation = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>("/auth/reset", { token, new_password: password }),
    onSuccess: () => {
      toast.success("Senha alterada! Entre com a nova senha.");
      navigate("/login");
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível alterar a senha.")),
  });

  if (!token) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-4 text-center">
        <div>
          <p className="text-slate-300">Link incompleto. Peça um novo para redefinir sua senha.</p>
          <Link to="/esqueci-senha" className="mt-3 inline-block text-sm font-semibold text-emerald-400 hover:underline">
            Pedir novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-4 py-16" data-testid="reset-page">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-3xl font-black tracking-tight text-white">Nova senha</h1>
        <p className="mt-1 text-sm text-slate-400">Escolha uma senha com pelo menos 8 caracteres.</p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reset-pass" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Nova senha
            </Label>
            <Input id="reset-pass" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Repita a nova senha
            </Label>
            <Input id="reset-confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <p className="text-xs text-red-400">As senhas não são iguais.</p>}
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={mutation.isPending || mismatch || password.length < 8}>
            {mutation.isPending ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
