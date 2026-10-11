import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiDetail, apiPost } from "@/lib/api";
import { SHOP_META } from "@/lib/shops";
import type { Shop, ShopKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coords: { lat: number; lng: number } | null;
}

const KINDS = Object.keys(SHOP_META) as ShopKind[];

/** Sugestão de uma borracharia/oficina no ponto tocado. Fica em análise até a equipe aprovar. */
export default function SuggestShopModal({ open, onOpenChange, coords }: Props) {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ShopKind>("borracharia");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiPost<Shop>("/shops", { kind, name, phone, address, hours, description, lat: coords?.lat, lng: coords?.lng }),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: ["shops"] });
      toast.success(s.status === "ativo" ? "Local publicado no mapa!" : "Local enviado para análise", {
        description: s.status === "ativo" ? undefined : "Assim que a equipe aprovar, ele aparece no mapa para todos.",
      });
      setName("");
      setPhone("");
      setAddress("");
      setHours("");
      setDescription("");
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível enviar o local")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-md" data-testid="suggest-shop-modal">
        <DialogHeader>
          <DialogTitle className="font-heading">Adicionar local para ciclistas</DialogTitle>
          <DialogDescription>Ajude outros ciclistas. A equipe confere antes de publicar no mapa.</DialogDescription>
        </DialogHeader>
        {!user ? (
          <p className="text-sm text-slate-400">Entre na sua conta para sugerir um local.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                    kind === k ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-slate-700 text-slate-400 hover:border-slate-600",
                  )}
                  data-testid={`shop-kind-${k}`}
                >
                  {SHOP_META[k].label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="shop-name" className="text-xs text-slate-400">Nome do local</Label>
              <Input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required data-testid="shop-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="shop-phone" className="text-xs text-slate-400">Telefone / WhatsApp</Label>
                <Input id="shop-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="(85) 99999-0000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="shop-hours" className="text-xs text-slate-400">Horário</Label>
                <Input id="shop-hours" value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} placeholder="Seg–Sáb 8h–18h" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="shop-address" className="text-xs text-slate-400">Endereço</Label>
              <Input id="shop-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={160} placeholder="Rua, número, bairro" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shop-desc" className="text-xs text-slate-400">Observações (opcional)</Label>
              <Textarea id="shop-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} placeholder="Ex.: conserta furo na hora, vende câmara de ar" />
            </div>
            <Button type="submit" className="w-full" disabled={!coords || name.trim().length < 2 || mutation.isPending} data-testid="shop-submit">
              {mutation.isPending ? "Enviando…" : "Enviar para análise"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
