import { useState } from "react";
import { api } from "./api.js";

export default function Auth({ onLogin }) {
  const [modo, setModo] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    try {
      onLogin(await api(modo === "login" ? "/login" : "/register", { method: "POST", body: form }));
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <form className="card" onSubmit={enviar}>
      <h1>🚲 VaiDeBike</h1>
      {modo === "cadastro" && <input placeholder="Nome" value={form.name} onChange={set("name")} required />}
      <input type="email" placeholder="E-mail" value={form.email} onChange={set("email")} required />
      <input type="password" placeholder="Senha (mín. 8 caracteres)" value={form.password} onChange={set("password")} required minLength={8} />
      {erro && <p className="erro">{erro}</p>}
      <button>{modo === "login" ? "Entrar" : "Criar conta"}</button>
      <a href="#" onClick={(e) => { e.preventDefault(); setModo(modo === "login" ? "cadastro" : "login"); }}>
        {modo === "login" ? "Não tenho conta" : "Já tenho conta"}
      </a>
    </form>
  );
}
