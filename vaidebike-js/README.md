# VaiDeBike Fortaleza — versão JavaScript

Mesmo app, só com o que já estudamos: **HTML, CSS, JavaScript, Node, Express, React e MySQL** (sem TypeScript, sem Python).

Nesta 1ª entrega (núcleo): cadastro/login, mapa com as ciclovias, buscar lugar, traçar rota de bike e reportar obstáculos.

## O que instalar (uma vez)
1. **Node.js** (versão 20 ou mais nova) — https://nodejs.org
2. **XAMPP** — https://www.apachefriends.org (usaremos o MySQL dele)

## Passo a passo
**1. Banco de dados**
- Abra o XAMPP e clique em **Start** no *MySQL*.
- Clique em **Admin** do MySQL (abre o phpMyAdmin) → aba **Importar** → escolha `backend/schema.sql` → **Importar**.

**2. Backend** (um terminal)
```
cd vaidebike-js/backend
npm install
copy .env.example .env      (no Linux/Mac: cp .env.example .env)
npm start
```
Deve aparecer `API em http://localhost:3001`. (No XAMPP o usuário `root` não tem senha; deixe `DB_PASSWORD=` vazio.)

**3. Frontend** (outro terminal)
```
cd vaidebike-js/frontend
npm install
npm run dev
```
Abra o endereço que aparecer (normalmente http://localhost:5173), crie uma conta e use.

**Testes simples do backend:** `cd backend && npm test`

## Estrutura
- `backend/server.js` — rotas da API (Express). `db.js` — conexão MySQL. `validate.js` — validações. `schema.sql` — tabelas e ciclovias.
- `frontend/src/` — `App.jsx` (login ou mapa), `Auth.jsx` (entrar/cadastrar), `MapView.jsx` (mapa), `api.js` (chamadas ao backend).

## Segurança já incluída
Senha com bcrypt; login por cookie `httpOnly` (token guardado só como hash); limite de tentativas; SQL com `?` (anti-injeção); `helmet`; CORS restrito; `.env` fora do Git.

## Ficou para as próximas entregas
Perfil/XP/medalhas, amigos e chat, lojas/borracharias, notificações, modo navegação com voz, relatório de bugs, moderação.
