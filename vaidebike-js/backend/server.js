import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import "dotenv/config";
import { pool } from "./db.js";
import { checkRegister, checkObstacle } from "./validate.js";

const app = express();
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const limit = (windowMin, max) => rateLimit({ windowMs: windowMin * 60_000, limit: max, standardHeaders: true, legacyHeaders: false });
const DIAS = 30;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

// --- sessão: cookie httpOnly (JavaScript do navegador não consegue ler) ---
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)", [sha(token), userId, DIAS]);
  res.cookie("sid", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: DIAS * 864e5 });
}

async function auth(req, res, next) {
  const token = req.cookies.sid;
  if (token) {
    const [rows] = await pool.query(
      "SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW()",
      [sha(token)],
    );
    req.user = rows[0];
  }
  if (!req.user) return res.status(401).json({ error: "Faça login" });
  next();
}

// --- contas ---
app.post("/api/register", limit(60, 10), async (req, res) => {
  const erro = checkRegister(req.body);
  if (erro) return res.status(400).json({ error: erro });
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  try {
    const [r] = await pool.query("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name.trim(), email.toLowerCase(), hash]);
    await startSession(res, r.insertId);
    res.status(201).json({ id: r.insertId, name: name.trim(), email: email.toLowerCase() });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "E-mail já cadastrado" });
    throw e;
  }
});

app.post("/api/login", limit(15, 20), async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ error: "Dados inválidos" });
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
  // mesma mensagem para e-mail errado e senha errada (não revela quem tem conta)
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: "E-mail ou senha incorretos" });
  await startSession(res, rows[0].id);
  res.json({ id: rows[0].id, name: rows[0].name, email: rows[0].email });
});

app.post("/api/logout", async (req, res) => {
  if (req.cookies.sid) await pool.query("DELETE FROM sessions WHERE token_hash = ?", [sha(req.cookies.sid)]);
  res.clearCookie("sid").json({ ok: true });
});

app.get("/api/me", auth, (req, res) => res.json(req.user));

// --- mapa ---
app.get("/api/bikelanes", async (_req, res) => {
  const [rows] = await pool.query("SELECT id, name, kind, length_km, notes, coordinates FROM bikelanes");
  res.json(rows);
});

app.get("/api/obstacles", async (_req, res) => {
  const [rows] = await pool.query("SELECT id, type, description, lat, lng, created_at FROM obstacles ORDER BY id DESC LIMIT 500");
  res.json(rows);
});

app.post("/api/obstacles", auth, limit(60, 30), async (req, res) => {
  const body = { ...req.body, lat: Number(req.body.lat), lng: Number(req.body.lng) };
  const erro = checkObstacle(body);
  if (erro) return res.status(400).json({ error: erro });
  const [r] = await pool.query("INSERT INTO obstacles (user_id, type, description, lat, lng) VALUES (?, ?, ?, ?, ?)", [req.user.id, body.type, body.description || null, body.lat, body.lng]);
  res.status(201).json({ id: r.insertId });
});

// --- busca e rota (serviços gratuitos do OpenStreetMap, repassados pelo servidor) ---
const UA = { "User-Agent": "VaiDeBike-Fortaleza-JS/1.0" };

app.get("/api/geocode", limit(1, 40), async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3 || q.length > 120) return res.json([]);
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: "br", viewbox: "-38.65,-3.65,-38.40,-3.90", bounded: "1", "accept-language": "pt-BR" });
  try {
    const items = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) })).json();
    res.json(items.map((i) => ({ name: i.name || i.display_name.split(",")[0], label: i.display_name, lat: +i.lat, lng: +i.lon })));
  } catch {
    res.json([]); // serviço externo fora do ar: lista vazia, sem derrubar o app
  }
});

app.get("/api/route", limit(1, 60), async (req, res) => {
  const [a, b, c, d] = ["fromLat", "fromLng", "toLat", "toLng"].map((k) => Number(req.query[k]));
  if (![a, b, c, d].every(Number.isFinite)) return res.status(400).json({ error: "Coordenadas inválidas" });
  const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${b},${a};${d},${c}?overview=full&geometries=geojson`;
  try {
    const r = (await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) })).json()).routes[0];
    res.json({ coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distance_m: Math.round(r.distance), duration_s: Math.round(r.duration) });
  } catch {
    res.status(502).json({ error: "Serviço de rotas indisponível" });
  }
});

// erro inesperado: não vaza detalhes para o cliente
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
});

const port = process.env.PORT || 3001;
if (process.argv[1].endsWith("server.js")) app.listen(port, () => console.log(`API em http://localhost:${port}`));
export default app;
