// Hand-written mirrors of the backend Pydantic models — keep both sides in sync in the same edit.

export interface User {
  id: string;
  name: string;
  email: string;
  bio: string;
  bike_type: string;
  city: string;
  xp: number;
  level: number;
  total_km: number;
  reports_count: number;
  confirms_count: number;
  badge_ids: string[];
  avatar: string;
  onboarded: boolean;
  is_moderator: boolean;
  created_at: string;
}

/** Outro ciclista, como qualquer pessoa logada o vê (sem e-mail). */
export interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  bike_type: string;
  level: number;
  xp: number;
  total_km: number;
  reports_count: number;
  badge_ids: string[];
  followers_count: number;
  following_count: number;
  is_following: boolean;
  follows_me: boolean;
}

export type ShopKind = "borracharia" | "oficina" | "autoreparo" | "bicicletar";

export interface Shop {
  id: string;
  name: string;
  kind: ShopKind;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  hours: string;
  description: string;
  website: string;
  status: "pendente" | "ativo" | "recusado";
  source: "osm" | "comunidade";
  added_by_name: string;
  rating_avg: number;
  rating_count: number;
}

export interface ShopReview {
  user_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface ShopDetail extends Shop {
  reviews: ShopReview[];
  my_review: ShopReview | null;
  can_delete: boolean;
}

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  tier: string;
  icon: string;
}

export type ObstacleType = "buraco" | "obra" | "trecho_inacabado" | "falta_iluminacao" | "outros";
export type Severity = "baixa" | "media" | "alta";

export interface Obstacle {
  id: string;
  user_id: string;
  user_name: string;
  type: ObstacleType;
  severity: Severity;
  description: string;
  lat: number;
  lng: number;
  /** pendente = em análise · ativo = aprovado (no mapa) · recusado · resolvido */
  status: string;
  confirms: number;
  created_at: string;
  reject_reason?: string;
  photo_ids?: string[];
}

export interface ModerationItem extends Obstacle {
  nearby_same_type: number;
  nearest_same_type_m: number | null;
}

export interface ModerationSummary {
  pendente: number;
  recusado: number;
  ativo: number;
}

export interface BikeLane {
  id: string;
  name: string;
  kind: "ciclovia" | "ciclofaixa";
  length_km: number;
  notes: string;
  coordinates: [number, number][];
  /** true quando `coordinates` já foi ajustada às ruas reais (polilinha densa) */
  snapped?: boolean;
  /** de onde veio: seed (exemplo), osm (OpenStreetMap) ou comunidade (desenhada pela equipe) */
  source?: "seed" | "osm" | "comunidade";
}

export interface RouteStep {
  instruction: string;
  name: string;
  type: string;
  modifier: string;
  distance_m: number;
  lat: number;
  lng: number;
}

export interface RouteResult {
  coordinates: [number, number][];
  distance_m: number;
  duration_s: number;
  steps: RouteStep[];
  /** "bike" = rota real por ruas; "straight" = fallback em linha reta (roteador indisponível) */
  source: "bike" | "straight";
}

export interface Place {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

export interface MissionProgress {
  id: string;
  title: string;
  desc: string;
  target: number;
  metric: string;
  reward_xp: number;
  badge_id: string;
  progress: number;
  completed: boolean;
}

export interface ReportResult {
  obstacle: Obstacle;
  user: User;
  new_badges: BadgeDef[];
}

export interface RideResult {
  user: User;
  new_badges: BadgeDef[];
}

export interface RideEntry {
  id: string;
  km: number;
  xp: number;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  level: number;
  xp: number;
  reports_count: number;
  badge_count: number;
}

export interface StatsPublic {
  bikelanes: number;
  obstacles_ativos: number;
  reports_total: number;
  ciclistas: number;
}

// UI metadata shared across components (colors mirror the design guidelines).
export const OBSTACLE_TYPES: Record<ObstacleType, { label: string; color: string }> = {
  buraco: { label: "Buraco / Asfalto ruim", color: "#EF4444" },
  obra: { label: "Obra na pista", color: "#F97316" },
  trecho_inacabado: { label: "Trecho inacabado", color: "#FBBF24" },
  falta_iluminacao: { label: "Falta de iluminação", color: "#A855F7" },
  outros: { label: "Outro obstáculo", color: "#38BDF8" },
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const BADGE_TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Prata: "#C0C0C0",
  Ouro: "#FBBF24",
  Platina: "#E5E4E2",
  Diamante: "#38BDF8",
};

export const BIKE_LABELS: Record<string, string> = {
  urbana: "Urbana",
  speed: "Speed",
  mtb: "Mountain bike",
  eletrica: "Elétrica",
  outra: "Outra",
};

/** Great-circle distance in meters (Haversine). */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatKm(km: number): string {
  return km >= 100 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  user_level: number;
  text: string;
  created_at: string;
}

export interface Meetup {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  place: string;
  description: string;
  starts_at: string;
  going_count: number;
  going: boolean;
  going_names: string[];
}

export interface NotificationItem {
  id: string;
  kind: "follow" | "alert_ok" | "alert_no" | "shop_ok" | "shop_no" | "announcement" | "bug_fixed";
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

export interface NotificationFeed {
  unread: number;
  items: NotificationItem[];
}

export type BugCategory = "travou" | "erro" | "visual" | "sugestao" | "outro";
export type BugStatus = "novo" | "analisando" | "resolvido";
export interface BugItem {
  id: string;
  category: BugCategory;
  message: string;
  status: BugStatus;
  user_name: string | null;
  page: string;
  user_agent: string;
  viewport: string;
  app_version: string;
  created_at: string;
}
export const BUG_CATEGORIES: Record<BugCategory, string> = {
  travou: "O app travou",
  erro: "Deu erro",
  visual: "Problema na tela",
  sugestao: "Sugestão",
  outro: "Outro",
};
