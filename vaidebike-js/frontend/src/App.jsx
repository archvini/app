import { useEffect, useState } from "react";
import { api } from "./api.js";
import Auth from "./Auth.jsx";
import MapView from "./MapView.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando, null = deslogado

  useEffect(() => {
    api("/me").then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p className="center">Carregando…</p>;
  if (!user) return <Auth onLogin={setUser} />;

  return (
    <>
      <header>
        <b>🚲 VaiDeBike Fortaleza</b>
        <span>
          Olá, {user.name}{" "}
          <button onClick={() => api("/logout", { method: "POST" }).then(() => setUser(null))}>Sair</button>
        </span>
      </header>
      <MapView />
    </>
  );
}
