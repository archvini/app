export const TYPES = ["buraco", "obra", "trecho_inacabado", "falta_iluminacao", "outros"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devolve texto de erro ou null se estiver tudo certo.
export function checkRegister({ name, email, password }) {
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) return "Nome inválido";
  if (typeof email !== "string" || !EMAIL.test(email) || email.length > 120) return "E-mail inválido";
  if (typeof password !== "string" || password.length < 8 || password.length > 100) return "Senha precisa ter de 8 a 100 caracteres";
  return null;
}

export function checkObstacle({ type, description, lat, lng }) {
  if (!TYPES.includes(type)) return "Tipo inválido";
  if (description != null && (typeof description !== "string" || description.length > 300)) return "Descrição muito longa";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "Posição inválida";
  return null;
}
