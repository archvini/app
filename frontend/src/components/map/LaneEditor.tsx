import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eraser, Pencil, Trash2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiDetail, apiPost } from "@/lib/api";
import type { BikeLane } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EditorMode = "off" | "draw" | "erase";

interface Props {
  mode: EditorMode;
  points: [number, number][];
  onModeChange: (m: EditorMode) => void;
  onPointsChange: (p: [number, number][]) => void;
  /** traçado escolhido no modo apagar */
  eraseTarget: BikeLane | null;
  onEraseTargetChange: (l: BikeLane | null) => void;
}

/** Barra da conta dev: desenhar ciclovia/ciclofaixa tocando no mapa ou apagar um traçado. */
export default function LaneEditor({ mode, points, onModeChange, onPointsChange, eraseTarget, onEraseTargetChange }: Props) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ciclovia" | "ciclofaixa">("ciclofaixa");

  const reset = () => {
    onPointsChange([]);
    onModeChange("off");
    setName("");
  };

  const save = useMutation({
    mutationFn: () => apiPost<BikeLane>("/bikelanes", { name, kind, waypoints: points }),
    onSuccess: (lane) => {
      void queryClient.invalidateQueries({ queryKey: ["bikelanes"] });
      toast.success("Traçado salvo", {
        description: `${lane.name} · ${lane.length_km} km`,
      });
      setSaveOpen(false);
      reset();
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível salvar o traçado")),
  });

  const erase = useMutation({
    mutationFn: (id: string) => apiDelete(`/bikelanes/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bikelanes"] });
      toast.success("Traçado removido");
      onEraseTargetChange(null);
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível remover o traçado")),
  });

  if (mode === "off") return null;

  return (
    <>
      <div
        className="absolute left-3 right-3 top-3 z-[1195] mx-auto flex max-w-[460px] flex-col gap-2 rounded-2xl border border-yellow-400/50 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md md:left-[404px] md:right-auto md:mx-0"
        data-testid="lane-editor"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-slate-900">
            {mode === "draw" ? <Pencil className="h-4 w-4" /> : <Eraser className="h-4 w-4" />}
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-white">
            {mode === "draw" ? "Desenhar ciclovia/ciclofaixa" : "Apagar traçado"}
          </p>
          <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs">
            {(["draw", "erase"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onModeChange(m);
                  onEraseTargetChange(null);
                }}
                className={cn("rounded-md px-2.5 py-1 font-semibold", mode === m ? "bg-yellow-400 text-slate-900" : "text-slate-300")}
                data-testid={`lane-mode-${m}`}
              >
                {m === "draw" ? "Desenhar" : "Apagar"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-xs" onClick={reset} aria-label="Sair do modo de traçado" data-testid="lane-editor-close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {mode === "draw" ? (
          <>
            <p className="text-xs leading-relaxed text-slate-400">
              Toque no mapa seguindo a rua, de ponta a ponta (a cada curva ou esquina ajuda). O traço fica exatamente onde você tocar: dê zoom e toque sobre a via, a cada curva ou esquina.
              {points.length > 0 && <b className="ml-1 text-yellow-300">{points.length} ponto{points.length > 1 ? "s" : ""}</b>}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={points.length === 0} onClick={() => onPointsChange(points.slice(0, -1))} data-testid="lane-undo">
                <Undo2 className="h-4 w-4" /> Desfazer
              </Button>
              <Button size="sm" variant="ghost" disabled={points.length === 0} onClick={() => onPointsChange([])}>
                Limpar
              </Button>
              <Button size="sm" className="ml-auto" disabled={points.length < 2} onClick={() => setSaveOpen(true)} data-testid="lane-finish">
                <Check className="h-4 w-4" /> Concluir
              </Button>
            </div>
          </>
        ) : eraseTarget ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-200">
              <b>{eraseTarget.name}</b> · {eraseTarget.kind === "ciclovia" ? "Ciclovia" : "Ciclofaixa"} · {eraseTarget.length_km} km
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={erase.isPending} onClick={() => erase.mutate(eraseTarget.id)} data-testid="lane-erase-confirm">
                <Trash2 className="h-4 w-4" /> {erase.isPending ? "Removendo…" : "Remover este traçado"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEraseTargetChange(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Toque em cima de uma ciclovia ou ciclofaixa para selecioná-la.</p>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-sm" data-testid="lane-save-modal">
          <DialogHeader>
            <DialogTitle className="font-heading">Salvar traçado</DialogTitle>
            <DialogDescription>O traço fica como você desenhou e aparecerá para todos os ciclistas.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="lane-name" className="text-xs text-slate-400">Nome (a rua ou avenida)</Label>
              <Input id="lane-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required data-testid="lane-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["ciclofaixa", "ciclovia"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    kind === k ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 text-slate-400",
                  )}
                  data-testid={`lane-kind-${k}`}
                >
                  <b className="block text-sm">{k === "ciclovia" ? "Ciclovia" : "Ciclofaixa"}</b>
                  {k === "ciclovia" ? "separada da pista, com barreira" : "faixa pintada na pista"}
                </button>
              ))}
            </div>
            <Button type="submit" className="w-full" disabled={name.trim().length < 2 || save.isPending} data-testid="lane-save">
              {save.isPending ? "Ajustando às ruas…" : "Salvar traçado"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
