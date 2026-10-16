import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "./api.js";

export const TIPOS = {
  buraco: "Buraco / Asfalto ruim",
  obra: "Obra na pista",
  trecho_inacabado: "Trecho inacabado",
  falta_iluminacao: "Falta de iluminação",
  outros: "Outro obstáculo",
};
const CENTRO = [-38.52, -3.73]; // [lng, lat] no MapLibre

// MapLibre usa [lng, lat]; nosso banco guarda [lat, lng]
const inverte = (pts) => pts.map(([lat, lng]) => [lng, lat]);

export default function MapView() {
  const divRef = useRef(null);
  const map = useRef(null);
  const marcadores = useRef([]);
  const [ponto, setPonto] = useState(null); // lugar tocado no mapa
  const [obstaculos, setObstaculos] = useState([]);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState([]);
  const [rota, setRota] = useState(null);
  const [form, setForm] = useState({ type: "buraco", description: "" });
  const [msg, setMsg] = useState("");

  // cria o mapa uma vez
  useEffect(() => {
    const m = new maplibregl.Map({
      container: divRef.current,
      center: CENTRO,
      zoom: 12,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl());
    m.on("click", (e) => setPonto({ lat: e.lngLat.lat, lng: e.lngLat.lng, nome: "Ponto no mapa" }));
    m.on("load", async () => {
      const lanes = await api("/bikelanes");
      m.addSource("lanes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: lanes.map((l) => ({ type: "Feature", properties: { kind: l.kind }, geometry: { type: "LineString", coordinates: inverte(l.coordinates) } })) },
      });
      m.addLayer({ id: "lanes", type: "line", source: "lanes", paint: { "line-width": 5, "line-color": ["match", ["get", "kind"], "ciclovia", "#16a34a", "#2563eb"] } });
    });
    carregarObstaculos();
    return () => m.remove();
  }, []);

  const carregarObstaculos = () => api("/obstacles").then(setObstaculos).catch(() => {});

  // redesenha os pinos dos obstáculos
  useEffect(() => {
    marcadores.current.forEach((x) => x.remove());
    marcadores.current = obstaculos.map((o) =>
      new maplibregl.Marker({ color: "#ef4444" })
        .setLngLat([o.lng, o.lat])
        .setPopup(new maplibregl.Popup().setText(`${TIPOS[o.type]}${o.description ? ": " + o.description : ""}`))
        .addTo(map.current),
    );
  }, [obstaculos]);

  // desenha a rota
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const data = { type: "Feature", geometry: { type: "LineString", coordinates: rota ? inverte(rota.coordinates) : [] } };
    if (m.getSource("rota")) m.getSource("rota").setData(data);
    else {
      m.addSource("rota", { type: "geojson", data });
      m.addLayer({ id: "rota", type: "line", source: "rota", paint: { "line-width": 6, "line-color": "#f59e0b" } });
    }
  }, [rota]);

  async function buscar(e) {
    e.preventDefault();
    setAchados(await api("/geocode?q=" + encodeURIComponent(busca)).catch(() => []));
  }

  function escolher(a) {
    setPonto({ lat: a.lat, lng: a.lng, nome: a.name });
    setAchados([]);
    map.current.flyTo({ center: [a.lng, a.lat], zoom: 16 });
  }

  function tracarRota() {
    if (!navigator.geolocation) return setMsg("Seu aparelho não tem GPS");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const q = new URLSearchParams({ fromLat: p.coords.latitude, fromLng: p.coords.longitude, toLat: ponto.lat, toLng: ponto.lng });
          setRota(await api("/route?" + q));
          setMsg("");
        } catch (err) { setMsg(err.message); }
      },
      () => setMsg("Permita o acesso à localização"),
    );
  }

  async function reportar(e) {
    e.preventDefault();
    try {
      await api("/obstacles", { method: "POST", body: { ...form, lat: ponto.lat, lng: ponto.lng } });
      setPonto(null);
      setForm({ type: "buraco", description: "" });
      carregarObstaculos();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="mapa">
      <div ref={divRef} className="map" />
      <div className="painel">
        <form onSubmit={buscar}>
          <input placeholder="Buscar rua, avenida, lugar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button>🔍</button>
        </form>
        {achados.map((a, i) => (
          <button key={i} className="item" onClick={() => escolher(a)}>{a.name}<small>{a.label}</small></button>
        ))}
        {ponto && (
          <form onSubmit={reportar}>
            <b>{ponto.nome}</b>
            <button type="button" onClick={tracarRota}>Traçar rota até aqui</button>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="Descrição (opcional)" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button>Reportar obstáculo aqui</button>
          </form>
        )}
        {rota && <p>🚲 {(rota.distance_m / 1000).toFixed(1)} km · {Math.round(rota.duration_s / 60)} min</p>}
        {msg && <p className="erro">{msg}</p>}
      </div>
    </div>
  );
}
