import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiDetail, apiPost } from "@/lib/api";
import { BUG_CATEGORIES } from "@/lib/types";
import type { BugCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Botão do topo: o usuário relata um problema do app (não do mapa) direto para a equipe. Funciona até sem login. */
export default function BugReportButton() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<BugCategory>("erro");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: () =>
      apiPost("/bugs", {
        category,
        message: message.trim(),
        // contexto automático para a equipe conseguir reproduzir o problema
        page: pathname,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        app_version: "beta",
      }),
    onSuccess: () => {
      toast.success("Obrigado! Seu relato foi enviado para a equipe.");
      setMessage("");
      setOpen(false);
    },
    onError: (e) => toast.error(apiDetail(e, "Não foi possível enviar agora. Tente de novo.")),
  });

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Relatar um problema do app" title="Relatar um problema do app" data-testid="bug-open">
        <Bug className="h-5 w-5 text-slate-300" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-md" data-testid="bug-modal">
          <DialogHeader>
            <DialogTitle className="font-heading">Relatar um problema do app</DialogTitle>
            <DialogDescription>Algo travou, deu erro ou não está certo? Conte o que aconteceu. Para problemas do mapa (buraco, obra…), use o botão Reportar.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BUG_CATEGORIES) as BugCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    category === c ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 text-slate-400 hover:border-slate-600",
                  )}
                  data-testid={`bug-cat-${c}`}
                >
                  {BUG_CATEGORIES[c]}
                </button>
              ))}
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="O que você estava fazendo e o que aconteceu? Ex.: ao tocar em Iniciar viagem, a tela ficou branca."
              data-testid="bug-message"
            />
            <p className="text-[11px] text-slate-500">Enviamos junto, automaticamente, a página, o aparelho e o tamanho da tela, só para ajudar a encontrar o problema.</p>
            <Button type="submit" className="w-full" disabled={message.trim().length < 10 || send.isPending} data-testid="bug-submit">
              {send.isPending ? "Enviando…" : "Enviar para a equipe"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
