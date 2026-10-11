import type { ShopKind } from "./types";

/** Desenhos (viewBox 24×24, só traço) e cores de cada tipo de local de apoio ao ciclista. */
export const SHOP_META: Record<ShopKind, { label: string; plural: string; color: string; paths: string[] }> = {
  borracharia: {
    label: "Borracharia",
    plural: "Borracharias",
    color: "#A855F7",
    // pneu: aro externo, miolo e quatro raios
    paths: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M12 3v6", "M12 15v6", "M3 12h6", "M15 12h6"],
  },
  oficina: {
    label: "Oficina de bike",
    plural: "Oficinas",
    color: "#3B82F6",
    // chave inglesa
    paths: [
      "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    ],
  },
  autoreparo: {
    label: "Ponto de autorreparo",
    plural: "Autorreparo",
    color: "#14B8A6",
    // bomba/ferramenta: cabo em T e haste
    paths: ["M6 4h12", "M12 4v9", "M8 13h8", "M10 13v7", "M14 13v7", "M8 20h8"],
  },
  bicicletar: {
    label: "Bicicletar / aluguel de bike",
    plural: "Bicicletar",
    color: "#F59E0B",
    // bicicleta: duas rodas, quadro e cabeça
    paths: ["M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0", "M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0", "M12 17.5V14l-3-3 4-3 2 3h2", "M14 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0"],
  },
};

export function shopSvg(kind: ShopKind, size = 18, stroke = "#fff"): string {
  const d = SHOP_META[kind].paths.map((p) => `<path d="${p}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/** Telefone só com dígitos (e +) para o link `tel:`. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
